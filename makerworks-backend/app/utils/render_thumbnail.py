#!/usr/bin/env python3
"""
Robust STL/3MF -> PNG thumbnail renderer.

- macOS: use Cocoa GL ("osx"), not EGL
- Try pyrender first; if the frame is empty/black, fall back to Plotly -> Pillow
- Always emit opaque RGB PNG (no alpha surprises)
"""

from __future__ import annotations

import os
import sys
import io
import math
import argparse
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

IS_DARWIN = (sys.platform == "darwin")

# ---- GL backend selection ----------------------------------------------------
# EGL is great in headless Linux. On macOS it usually produces black frames.
if IS_DARWIN:
    os.environ["PYOPENGL_PLATFORM"] = "osx"
else:
    os.environ.setdefault("PYOPENGL_PLATFORM", os.environ.get("PYOPENGL_PLATFORM", "egl"))


# ---- CLI --------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Render STL/3MF to square PNG (orthographic, 1:1).")
    p.add_argument("input", help="Input .stl or .3mf")
    p.add_argument("output", help="Output .png")
    p.add_argument("--size", type=int, default=int(os.getenv("THUMBNAIL_SIZE", "1024")),
                   help="PNG edge size in pixels (square).")
    p.add_argument("--margin", type=float, default=float(os.getenv("THUMBNAIL_MARGIN", "0.06")),
                   help="Relative margin (e.g., 0.06 = 6% padding).")
    p.add_argument("--azim", type=float, default=float(os.getenv("THUMBNAIL_AZIM_DEG", "45")),
                   help="Azimuth in degrees around +Z (0 = +X, 90 = +Y).")
    p.add_argument("--elev", type=float, default=float(os.getenv("THUMBNAIL_ELEV_DEG", "25")),
                   help="Elevation in degrees from XY plane (+ up).")
    p.add_argument("--bg", default=os.getenv("THUMBNAIL_BG_RGB", "1.0,1.0,1.0"),
                   help="Background RGB as 'r,g,b' in [0,1].")
    p.add_argument("--grey", type=float, default=float(os.getenv("MODEL_GREY", "0.9")),
                   help="Monochrome albedo if the model has no colors.")
    p.add_argument("--backend", choices=["auto", "pyrender", "plotly"],
                   default=os.getenv("THUMBNAIL_BACKEND", "auto"),
                   help="Rendering backend preference.")
    return p.parse_args()


# ---- Geometry helpers --------------------------------------------------------
def spherical_to_cart(azim_deg: float, elev_deg: float, r: float) -> np.ndarray:
    az = np.deg2rad(azim_deg)
    el = np.deg2rad(elev_deg)
    x = r * math.cos(el) * math.cos(az)
    y = r * math.cos(el) * math.sin(az)
    z = r * math.sin(el)
    return np.array([x, y, z], dtype=float)

def look_at(eye: np.ndarray, target: np.ndarray, up=np.array([0.0, 0.0, 1.0], dtype=float)):
    f = (target - eye).astype(float); f /= (np.linalg.norm(f) + 1e-12)
    u = up.astype(float);            u /= (np.linalg.norm(u) + 1e-12)
    s = np.cross(f, u)
    if np.linalg.norm(s) < 1e-9:
        u = np.array([0.0, 1.0, 0.0], dtype=float)
        s = np.cross(f, u)
    s /= (np.linalg.norm(s) + 1e-12)
    u = np.cross(s, f)
    M = np.eye(4, dtype=float)
    M[:3, :3] = np.vstack([s, u, -f])
    M[:3, 3] = eye
    return M

def bbox_corners(bmin, bmax):
    xs = [bmin[0], bmax[0]]; ys = [bmin[1], bmax[1]]; zs = [bmin[2], bmax[2]]
    return np.array([[x, y, z, 1.0] for x in xs for y in ys for z in zs], dtype=float)

def load_mesh_force_mesh(path: str) -> trimesh.Trimesh:
    m = trimesh.load(path, force='mesh')
    if isinstance(m, trimesh.Trimesh):
        return m
    if isinstance(m, trimesh.Scene):
        geoms = [g for g in m.dump() if isinstance(g, trimesh.Trimesh)]
        if not geoms:
            raise RuntimeError("Loaded scene has no mesh geometry.")
        return trimesh.util.concatenate(geoms)
    raise RuntimeError(f"Unsupported mesh type: {type(m)}")


# ---- Backends ---------------------------------------------------------------
def render_with_pyrender(mesh: trimesh.Trimesh, size: int, margin: float,
                         azim_deg: float, elev_deg: float, bg_rgb: tuple, mono_grey: float) -> np.ndarray:
    import pyrender

    if mesh.is_empty:
        raise RuntimeError("Mesh has no triangles.")

    bmin, bmax = mesh.bounds
    center = 0.5 * (bmin + bmax)
    extents = (bmax - bmin)
    radius = float(np.linalg.norm(extents)) * 0.5 or 1e-6

    scene = pyrender.Scene(
        ambient_light=np.array([0.35, 0.35, 0.35, 1.0], dtype=float),
        bg_color=np.array([bg_rgb[0], bg_rgb[1], bg_rgb[2], 1.0], dtype=float),
    )

    material = pyrender.MetallicRoughnessMaterial(
        baseColorFactor=[mono_grey, mono_grey, mono_grey, 1.0],
        metallicFactor=0.0,
        roughnessFactor=0.8,
        doubleSided=True,
    )
    pm = pyrender.Mesh.from_trimesh(mesh, material=material, smooth=False)
    scene.add(pm)

    cam_dist = radius * 4.0 + 1.0
    cam_pos = spherical_to_cart(azim_deg, elev_deg, cam_dist) + center
    cam_pose = look_at(cam_pos, center)

    corners = bbox_corners(bmin, bmax)
    T_wc = np.linalg.inv(cam_pose)
    cam_corners = (T_wc @ corners.T).T
    xs = cam_corners[:, 0]; ys = cam_corners[:, 1]; zvals = cam_corners[:, 2]
    half_w = 0.5 * (xs.max() - xs.min()); half_h = 0.5 * (ys.max() - ys.min())
    scale = 1.0 + float(margin)
    xmag = max(half_w * scale, 1e-6); ymag = max(half_h * scale, 1e-6)
    maxmag = max(xmag, ymag); xmag = ymag = maxmag
    near = max(1e-3, float(-(zvals.max()) - radius * 0.5))
    far  = max(near + 1e-3, float(-(zvals.min()) + radius * 0.5))

    camera = pyrender.OrthographicCamera(xmag=xmag, ymag=ymag, znear=near, zfar=far)
    scene.add(camera, pose=cam_pose)

    def dir_pose(dir3):
        d = np.asarray(dir3, dtype=float); d /= (np.linalg.norm(d) + 1e-12)
        z = -d
        x = np.cross(np.array([0, 0, 1.0], dtype=float), z)
        if np.linalg.norm(x) < 1e-6: x = np.array([1.0, 0.0, 0.0], dtype=float)
        x /= (np.linalg.norm(x) + 1e-12); y = np.cross(z, x)
        M = np.eye(4, dtype=float); M[:3, :3] = np.vstack([x, y, z]); M[:3, 3] = cam_pos
        return M

    scene.add(pyrender.DirectionalLight(intensity=3.0),  pose=dir_pose([ 0.3,  0.2,  1.0]))
    scene.add(pyrender.DirectionalLight(intensity=1.2),  pose=dir_pose([-0.6, -0.2,  1.0]))
    scene.add(pyrender.DirectionalLight(intensity=0.8),  pose=dir_pose([-0.2,  0.8, -0.3]))

    r = pyrender.OffscreenRenderer(viewport_width=size, viewport_height=size)
    color, _ = r.render(scene, flags=pyrender.RenderFlags.RGBA)
    try:
        r.delete()
    except Exception:
        pass
    return color  # HxWx4 uint8


def render_with_plotly(mesh: trimesh.Trimesh, size: int, margin: float,
                       azim_deg: float, elev_deg: float, bg_rgb: tuple, mono_grey: float) -> np.ndarray:
    import plotly.graph_objects as go

    if mesh.vertex_normals is None or len(mesh.vertex_normals) == 0:
        mesh.rezero()
        mesh.compute_vertex_normals()

    bmin, bmax = mesh.bounds
    center = 0.5 * (bmin + bmax)
    rel = mesh.vertices - center

    # Build camera basis matching the pyrender look
    view_dir = spherical_to_cart(azim_deg, elev_deg, 1.0)
    up_hint = np.array([0.0, 0.0, 1.0], dtype=float)
    f = view_dir / (np.linalg.norm(view_dir) + 1e-12)
    u = up_hint / (np.linalg.norm(up_hint) + 1e-12)
    r = np.cross(f, u)
    if np.linalg.norm(r) < 1e-9:
        u = np.array([0.0, 1.0, 0.0]); r = np.cross(f, u)
    r /= (np.linalg.norm(r) + 1e-12); u = np.cross(r, f)

    x_cam = rel @ r; y_cam = rel @ u; z_cam = rel @ f
    corners = bbox_corners(bmin, bmax)
    xs = (corners[:, :3] - center) @ r; ys = (corners[:, :3] - center) @ u
    half_w = 0.5 * (xs.max() - xs.min()); half_h = 0.5 * (ys.max() - ys.min())
    maxmag = max(half_w, half_h) * (1.0 + float(margin))

    faces = mesh.faces.astype(int)
    # flat monochrome (fake shaded look not needed; let Plotly handle)
    grey = int(max(0, min(255, round(255 * mono_grey))))
    rgba = np.column_stack([np.full(len(mesh.vertices), grey, np.uint8),
                            np.full(len(mesh.vertices), grey, np.uint8),
                            np.full(len(mesh.vertices), grey, np.uint8),
                            np.full(len(mesh.vertices), 255,  np.uint8)])

    fig = go.Figure(data=[go.Mesh3d(
        x=x_cam, y=y_cam, z=z_cam,
        i=faces[:, 0], j=faces[:, 1], k=faces[:, 2],
        vertexcolor=rgba,
        flatshading=True,
        showscale=False,
    )])

    bg_css = f"rgb({int(255*bg_rgb[0])},{int(255*bg_rgb[1])},{int(255*bg_rgb[2])})"
    fig.update_layout(
        scene=dict(
            xaxis=dict(visible=False, range=[-maxmag, maxmag]),
            yaxis=dict(visible=False, range=[-maxmag, maxmag]),
            zaxis=dict(visible=False),
            camera=dict(projection=dict(type="orthographic"),
                        eye=dict(x=0, y=0, z=2)),
            bgcolor=bg_css,
        ),
        paper_bgcolor=bg_css,
        width=size, height=size, margin=dict(l=0, r=0, t=0, b=0),
    )

    img_bytes = fig.to_image(format="png", width=size, height=size, scale=1)
    im = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    return np.array(im, dtype=np.uint8)


# ---- Composition & save -----------------------------------------------------
def compose_and_write(color_rgba: np.ndarray, out_path: str, size: int, bg_rgb: tuple):
    """
    Composite RGBA on opaque background and write a clean RGB PNG.
    """
    img = Image.fromarray(color_rgba, mode="RGBA")
    bg = Image.new("RGBA", (size, size), tuple(int(255*x) for x in (*bg_rgb, 1.0)))
    bg.alpha_composite(img)
    img_rgb = bg.convert("RGB")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img_rgb.save(out_path, format="PNG", optimize=True)
    # sanity check PNG signature
    with open(out_path, "rb") as f:
        sig = f.read(8)
    if sig != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Output is not a valid PNG (bad signature).")


# ---- Main render flow -------------------------------------------------------
def main():
    args = parse_args()
    try:
        bg = tuple(map(float, args.bg.split(",")))
        if len(bg) != 3 or any((v < 0 or v > 1) for v in bg):
            raise ValueError
    except Exception:
        raise SystemExit("Invalid --bg; expected 'r,g,b' with values in [0,1].")

    # Load mesh
    try:
        mesh = load_mesh_force_mesh(args.input)
    except Exception as e:
        hint = " (3MF may require `pip install meshio`)" if str(args.input).lower().endswith(".3mf") else ""
        raise SystemExit(f"Failed to load '{args.input}': {e}{hint}")

    # Choose backend
    backend_order = {
        "auto":    (["pyrender", "plotly"] if not IS_DARWIN else ["pyrender", "plotly"]),
        "pyrender": ["pyrender"],
        "plotly":  ["plotly"],
    }[args.backend]

    last_err = None
    for be in backend_order:
        try:
            if be == "pyrender":
                color = render_with_pyrender(mesh, args.size, args.margin, args.azim, args.elev, bg, args.grey)
                # guard: detect “all black” frames (common when GL context is unhappy)
                if color.ndim != 3 or color.shape[2] != 4:
                    raise RuntimeError("pyrender returned unexpected buffer shape")
                if color.max() <= 2 and color.mean() < 1.0:
                    raise RuntimeError("pyrender produced an all-black frame")
                compose_and_write(color, args.output, args.size, bg)
                print(f"wrote: {args.output}  size: {Path(args.output).stat().st_size} bytes  shape: {args.size}x{args.size}  backend: pyrender")
                return
            else:
                color = render_with_plotly(mesh, args.size, args.margin, args.azim, args.elev, bg, args.grey)
                compose_and_write(color, args.output, args.size, bg)
                print(f"wrote: {args.output}  size: {Path(args.output).stat().st_size} bytes  shape: {args.size}x{args.size}  backend: plotly")
                return
        except Exception as e:
            last_err = e
            # try the next backend
            continue

    raise SystemExit(f"All backends failed. Last error: {last_err}")

if __name__ == "__main__":
    main()
