#!/usr/bin/env python3
"""
Render STL/3MF -> square 1:1 PNG (orthographic, tight fit), with GPU when available.

Key changes:
- Final output is *always* a plain RGB PNG (no alpha).
- CPU path uses Plotly `to_image()` -> write via Pillow.
- After any backend, we re-encode and validate PNG signature to avoid "unsupported file type".
"""

import os
import sys
import io
import math
import argparse
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

# CPU renderer deps
import plotly.graph_objects as go


# ------------------------------ Args ------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Render STL/3MF to square PNG (orthographic, 1:1).")
    p.add_argument("input", help="Input .stl or .3mf")
    p.add_argument("output", help="Output .png")
    p.add_argument("--size", type=int, default=int(os.getenv("THUMBNAIL_SIZE", "1024")),
                   help="PNG edge size in pixels (square).")
    p.add_argument("--margin", type=float, default=float(os.getenv("THUMBNAIL_MARGIN", "0.06")),
                   help="Final padding around the cropped model as a fraction of its bbox.")
    # Defaults = Benchy side-on
    p.add_argument("--azim", type=float, default=float(os.getenv("THUMBNAIL_AZIM_DEG", "90")),
                   help="Azimuth in degrees around +Z (0 = +X, 90 = +Y).")
    p.add_argument("--elev", type=float, default=float(os.getenv("THUMBNAIL_ELEV_DEG", "0")),
                   help="Elevation in degrees from XY plane (+ up).")
    p.add_argument("--bg", default=os.getenv("THUMBNAIL_BG_RGB", "1.0,1.0,1.0"),
                   help="Background RGB as 'r,g,b' in [0,1].")
    p.add_argument("--grey", type=float, default=float(os.getenv("MODEL_GREY", "0.9")),
                   help="Monochrome albedo if the model has no colors.")
    # Shading knobs
    p.add_argument("--key-azim-offset", type=float, default=-35.0)
    p.add_argument("--key-elev-offset", type=float, default=25.0)
    p.add_argument("--rim", type=float, default=0.60)
    p.add_argument("--rim-power", type=float, default=2.5)
    p.add_argument("--diffuse", type=float, default=0.90)
    p.add_argument("--ambient", type=float, default=0.30)
    # Backend control
    p.add_argument("--backend", choices=["auto", "gpu", "cpu"],
                   default=os.getenv("THUMBNAIL_BACKEND", "auto"),
                   help="Rendering backend. 'auto' tries GPU first, then CPU.")
    return p.parse_args()


# --------------------------- Utils ---------------------------

PNG_SIG = b"\x89PNG\r\n\x1a\n"

def is_png_file(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            sig = f.read(8)
        return sig == PNG_SIG
    except Exception:
        return False

def finalize_png(path: str) -> None:
    """
    Re-open with Pillow, force RGB, save as PNG (optimize), and validate signature.
    """
    im = Image.open(path)
    # Flatten any alpha on white (or whatever background was used earlier)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    # Overwrite in-place as PNG
    im.save(path, format="PNG", optimize=True)
    if not is_png_file(path):
        raise RuntimeError(f"Output is not a valid PNG file: {path}")


# --------------------------- Math helpers ---------------------------

def spherical_to_cart(azim_deg: float, elev_deg: float, r: float = 1.0) -> np.ndarray:
    az = np.deg2rad(azim_deg)
    el = np.deg2rad(elev_deg)
    x = r * math.cos(el) * math.cos(az)
    y = r * math.cos(el) * math.sin(az)
    z = r * math.sin(el)
    return np.array([x, y, z], dtype=np.float64)

def bbox_corners(bmin, bmax):
    xs = [bmin[0], bmax[0]]
    ys = [bmin[1], bmax[1]]
    zs = [bmin[2], bmax[2]]
    return np.array([[x, y, z] for x in xs for y in ys for z in zs], dtype=np.float64)

def load_mesh_force_mesh(path: str) -> trimesh.Trimesh:
    m = trimesh.load(path, force='mesh')  # 3MF via meshio
    if isinstance(m, trimesh.Trimesh):
        return m
    if isinstance(m, trimesh.Scene):
        geoms = [g for g in m.dump() if isinstance(g, trimesh.Trimesh)]
        if not geoms:
            raise RuntimeError("Loaded scene has no mesh geometry.")
        return trimesh.util.concatenate(geoms)
    raise RuntimeError(f"Unsupported mesh type: {type(m)}")


# ------------------------ Fit calculations ------------------------

def compute_camera_basis(view_dir: np.ndarray, up_hint: np.ndarray):
    f = view_dir / (np.linalg.norm(view_dir) + 1e-12)
    u = up_hint / (np.linalg.norm(up_hint) + 1e-12)
    r = np.cross(f, u)
    if np.linalg.norm(r) < 1e-9:
        u = np.array([0.0, 1.0, 0.0])
        r = np.cross(f, u)
    r = r / (np.linalg.norm(r) + 1e-12)
    u = np.cross(r, f)
    return r, u, f  # right, up, forward

def project_bbox_to_camera(bmin: np.ndarray, bmax: np.ndarray, center: np.ndarray,
                           right: np.ndarray, up: np.ndarray, forward: np.ndarray):
    corners = bbox_corners(bmin, bmax)
    rel = corners - center
    xs = rel @ right
    ys = rel @ up
    zs = rel @ forward
    half_w = 0.5 * (xs.max() - xs.min())
    half_h = 0.5 * (ys.max() - ys.min())
    zmin, zmax = zs.min(), zs.max()
    return half_w, half_h, zmin, zmax


# ----------------------- Shading (baked) --------------------------

def bake_shade(normals_world: np.ndarray, right: np.ndarray, up: np.ndarray, forward: np.ndarray,
               key_azim_off: float, key_elev_off: float,
               rim_s: float, rim_pow: float, diff_s: float, amb_s: float,
               base_grey: float):
    R = np.stack([right, up, forward], axis=1)  # world->cam (3x3)
    n_cam = normals_world @ R

    key_dir_cam = spherical_to_cart(key_azim_off, key_elev_off, 1.0)
    key_dir_cam /= (np.linalg.norm(key_dir_cam) + 1e-12)
    view_cam = np.array([0.0, 0.0, 1.0])

    lambert = np.clip((n_cam @ key_dir_cam), 0.0, 1.0)
    rim = np.power(np.clip(1.0 - np.abs(n_cam @ view_cam), 0.0, 1.0), rim_pow)
    shade = np.clip(amb_s + diff_s * lambert + rim_s * rim, 0.0, 1.0)

    base = np.clip(base_grey, 0.0, 1.0)
    rgb = (base * shade).astype(np.float64)
    rgba = np.stack([rgb, rgb, rgb, np.ones_like(rgb)], axis=1)
    return rgba  # Nx4 float


# --------------------------- GPU renderer -------------------------

def render_gpu_with_pygfx(mesh: trimesh.Trimesh, out_png: str, size: int, margin: float,
                          azim_deg: float, elev_deg: float, bg_rgb: tuple, mono_grey: float,
                          key_azim_off: float, key_elev_off: float, rim_s: float, rim_pow: float,
                          diff_s: float, amb_s: float) -> bool:
    try:
        import pygfx as gfx
        from wgpu.gui.offscreen import WgpuCanvas
        from pygfx.renderers.wgpu import WgpuRenderer
    except Exception:
        return False

    if mesh.is_empty or mesh.faces is None or len(mesh.faces) == 0:
        raise RuntimeError("Mesh has no triangles.")

    if mesh.vertex_normals is None or len(mesh.vertex_normals) == 0:
        mesh.rezero()
        mesh.compute_vertex_normals()

    verts = np.asarray(mesh.vertices, dtype=np.float32)
    norms = np.asarray(mesh.vertex_normals, dtype=np.float32)
    faces = np.asarray(mesh.faces, dtype=np.uint32)
    bmin, bmax = mesh.bounds
    center = (0.5 * (bmin + bmax)).astype(np.float32)

    view_dir = spherical_to_cart(azim_deg, elev_deg, 1.0).astype(np.float32)
    up_hint = np.array([0.0, 0.0, 1.0], dtype=np.float32)
    right, up, forward = compute_camera_basis(view_dir, up_hint)

    half_w, half_h, zmin, zmax = project_bbox_to_camera(bmin, bmax, center, right, up, forward)
    s = float(max(half_w, half_h))

    rel = verts - center
    x_cam = (rel @ right).astype(np.float32)
    y_cam = (rel @ up).astype(np.float32)
    z_cam = (rel @ forward).astype(np.float32)
    positions = np.stack([x_cam, y_cam, z_cam], axis=1)

    colors = bake_shade(norms.astype(np.float64), right, up, forward,
                        key_azim_off, key_elev_off, rim_s, rim_pow, diff_s, amb_s, mono_grey).astype(np.float32)

    geom = gfx.Geometry(positions=positions, indices=faces)
    try:
        geom.colors = colors
    except Exception:
        geom.set_attribute("colors", gfx.Buffer(colors))
    material = gfx.MeshBasicMaterial(vertex_colors=True)
    mesh_node = gfx.Mesh(geom, material)

    scene = gfx.Scene()
    scene.add(mesh_node)

    try:
        cam = gfx.OrthographicCamera(2 * s, 2 * s)
    except Exception:
        cam = gfx.OrthographicCamera()
        try:
            cam.set_view_size(2 * s, 2 * s)
        except Exception:
            pass

    dist = float(np.linalg.norm(bmax - bmin) * 2.0 + 1.0)
    cam_pos = (-forward * dist).astype(np.float32)
    cam.local.position = (float(cam_pos[0]), float(cam_pos[1]), float(cam_pos[2]))
    try:
        cam.show_object(mesh_node, view_dir=(float(forward[0]), float(forward[1]), float(forward[2])),
                        up=(float(up[0]), float(up[1]), float(up[2])), scale=1.0)
    except Exception:
        m = np.eye(4, dtype=np.float32)
        m[:3, 0] = right
        m[:3, 1] = up
        m[:3, 2] = -forward
        m[:3, 3] = cam_pos
        try:
            cam.world.matrix = m
        except Exception:
            cam.local.matrix = m

    canvas = WgpuCanvas(size=(size, size), max_fps=0)
    renderer = WgpuRenderer(canvas, bgcolor=(bg_rgb[0], bg_rgb[1], bg_rgb[2], 1.0))
    renderer.render(scene, cam)
    img = renderer.snapshot()  # HxWx4 uint8

    im = Image.fromarray(img, mode="RGBA")
    Path(out_png).parent.mkdir(parents=True, exist_ok=True)
    im.save(out_png, format="PNG")

    enforce_tight_square(out_png, size, bg_rgb, margin)
    finalize_png(out_png)
    return True


# --------------------------- CPU renderer -------------------------

def render_cpu_plotly(mesh: trimesh.Trimesh, out_png: str, size: int, margin: float,
                      azim_deg: float, elev_deg: float, bg_rgb: tuple, mono_grey: float,
                      key_azim_off: float, key_elev_off: float, rim_s: float, rim_pow: float,
                      diff_s: float, amb_s: float):

    if mesh.is_empty or mesh.faces is None or len(mesh.faces) == 0:
        raise RuntimeError("Mesh has no triangles.")

    if mesh.vertex_normals is None or len(mesh.vertex_normals) == 0:
        mesh.rezero()
        mesh.compute_vertex_normals()

    verts = np.asarray(mesh.vertices, dtype=np.float64)
    norms = np.asarray(mesh.vertex_normals, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int32)
    bmin, bmax = mesh.bounds
    center = 0.5 * (bmin + bmax)

    view_dir = spherical_to_cart(azim_deg, elev_deg, 1.0)
    up_hint = np.array([0.0, 0.0, 1.0], dtype=np.float64)
    right, up, forward = compute_camera_basis(view_dir, up_hint)

    half_w, half_h, zmin, zmax = project_bbox_to_camera(bmin, bmax, center, right, up, forward)
    s = max(half_w, half_h)

    rel = verts - center
    x_cam = rel @ right
    y_cam = rel @ up
    z_cam = rel @ forward

    rgba_f = bake_shade(norms, right, up, forward,
                        key_azim_off, key_elev_off, rim_s, rim_pow, diff_s, amb_s, mono_grey)
    vertexcolor = (np.clip(rgba_f * 255.0, 0, 255)).astype(np.uint8)

    mesh3d = go.Mesh3d(
        x=x_cam, y=y_cam, z=z_cam,
        i=faces[:, 0], j=faces[:, 1], k=faces[:, 2],
        flatshading=False,
        vertexcolor=vertexcolor,
        lighting=dict(ambient=1.0, diffuse=0.0, specular=0.0, roughness=1.0, fresnel=0.0),
        showscale=False,
    )

    pad_z = 0.5 * (zmax - zmin) + 1e-3
    scene = dict(
        xaxis=dict(visible=False, range=[-s, s]),
        yaxis=dict(visible=False, range=[-s, s]),
        zaxis=dict(visible=False, range=[zmin - pad_z, zmax + pad_z]),
        aspectmode="manual",
        aspectratio=dict(x=1, y=1, z=1),
        camera=dict(
            projection=dict(type="orthographic"),
            eye=dict(x=0, y=0, z=2),
            up=dict(x=0, y=1, z=0),
            center=dict(x=0, y=0, z=0),
        ),
        bgcolor=f"rgb({int(255*bg_rgb[0])},{int(255*bg_rgb[1])},{int(255*bg_rgb[2])})",
    )

    fig = go.Figure(data=[mesh3d])
    fig.update_layout(
        scene=scene,
        paper_bgcolor=scene["bgcolor"],
        width=size, height=size,
        margin=dict(l=0, r=0, t=0, b=0),
    )

    # Render to bytes -> Pillow -> PNG (avoids kaleido file oddities)
    img_bytes = fig.to_image(format="png", width=size, height=size, scale=1)
    im = Image.open(io.BytesIO(img_bytes))
    Path(out_png).parent.mkdir(parents=True, exist_ok=True)
    im.save(out_png, format="PNG")

    enforce_tight_square(out_png, size, bg_rgb, margin)
    finalize_png(out_png)


# --------------------------- Post-process -------------------------

def enforce_tight_square(path: str, final_size: int, bg_rgb: tuple, frac_margin: float):
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.int16)
    bg = np.array([int(255*bg_rgb[0]), int(255*bg_rgb[1]), int(255*bg_rgb[2]), 255], dtype=np.int16)

    diff = np.abs(arr - bg)
    mask = (diff[..., 0] + diff[..., 1] + diff[..., 2]) > 5
    if not mask.any():
        # flatten alpha and save as RGB PNG
        out = Image.new("RGB", im.size, (int(255*bg_rgb[0]), int(255*bg_rgb[1]), int(255*bg_rgb[2])))
        out.paste(im, mask=im.split()[-1])
        out.save(path, format="PNG", optimize=True)
        return

    ys, xs = np.where(mask)
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()

    w = x1 - x0 + 1
    h = y1 - y0 + 1
    side = max(w, h)
    pad = int(round(side * float(frac_margin)))

    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    half = side / 2.0 + pad

    left   = max(0, int(math.floor(cx - half)))
    right  = min(im.width, int(math.ceil(cx + half)))
    top    = max(0, int(math.floor(cy - half)))
    bottom = min(im.height, int(math.ceil(cy + half)))

    crop = im.crop((left, top, right, bottom)).resize((final_size, final_size), Image.LANCZOS)

    # Compose onto an RGB canvas and overwrite
    rgb_bg = (int(255*bg_rgb[0]), int(255*bg_rgb[1]), int(255*bg_rgb[2]))
    canvas = Image.new("RGB", (final_size, final_size), rgb_bg)
    canvas.paste(crop.convert("RGBA"), (0, 0), crop.split()[-1])
    canvas.save(path, format="PNG", optimize=True)


# ----------------------------- Main -------------------------------

def main():
    args = parse_args()
    try:
        bg = tuple(map(float, args.bg.split(",")))
        if len(bg) != 3 or not all(0.0 <= v <= 1.0 for v in bg):
            raise ValueError
    except Exception:
        raise SystemExit("Invalid --bg; expected 'r,g,b' in [0,1].")

    try:
        m = load_mesh_force_mesh(args.input)
    except Exception as e:
        hint = ""
        if str(args.input).lower().endswith(".3mf"):
            hint = " (3MF may require `pip install meshio`)"
        raise SystemExit(f"Failed to load '{args.input}': {e}{hint}")

    backend = (args.backend or "auto").lower()
    used_gpu = False
    if backend in ("auto", "gpu"):
        try:
            render_ok = render_gpu_with_pygfx(
                m, args.output, args.size, args.margin, args.azim, args.elev, bg, args.grey,
                args.key_azim_offset, args.key_elev_offset, args.rim, args.rim_power, args.diffuse, args.ambient
            )
            used_gpu = render_ok
        except Exception:
            render_ok = False
        if not render_ok and backend == "gpu":
            raise SystemExit("GPU backend requested but failed. Install 'wgpu' and 'pygfx', or use --backend cpu.")

    if not used_gpu:
        render_cpu_plotly(
            m, args.output, args.size, args.margin, args.azim, args.elev, bg, args.grey,
            args.key_azim_offset, args.key_elev_offset, args.rim, args.rim_power, args.diffuse, args.ambient
        )

    # Final guard: ensure PNG signature and report
    if not is_png_file(args.output):
        raise SystemExit(f"Renderer produced a non-PNG file: {args.output}")

    print(f"wrote: {args.output}  size: {Path(args.output).stat().st_size} bytes  "
          f"shape: {args.size}x{args.size}  backend: {'gpu' if used_gpu else 'cpu'}")


if __name__ == "__main__":
    main()
