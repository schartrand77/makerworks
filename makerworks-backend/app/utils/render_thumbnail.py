#!/usr/bin/env python3
"""
Robust STL/3MF -> PNG thumbnail renderer.

Side-profile, orthographic, tight-frame, neutral grey on white.

Orientation pipeline:
  1) 'side' preset (az=90,elev=0) for profile
  2) 2D PCA align (long axis -> horizontal)
  3) yaw=+90° default (points right)
  4) Auto-level: by default use LOWER-BAND regression (waterline) to zero tilt.
     Modes: 'lower' | 'global' | 'none'
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
if IS_DARWIN:
    os.environ["PYOPENGL_PLATFORM"] = "osx"
else:
    os.environ.setdefault("PYOPENGL_PLATFORM", os.environ.get("PYOPENGL_PLATFORM", "egl"))

# ---- CLI --------------------------------------------------------------------
def _env_truthy(key: str, default: str = "1") -> bool:
    return (os.getenv(key, default) or "").strip().lower() in {"1", "true", "yes", "on"}

def parse_args():
    p = argparse.ArgumentParser(description="Render STL/3MF to square PNG (orthographic, 1:1).")
    p.add_argument("input", help="Input .stl or .3mf")
    p.add_argument("output", help="Output .png")

    # View presets
    p.add_argument("--preset", choices=["auto", "side", "front", "iso"],
                   default=os.getenv("THUMBNAIL_PRESET", "side"),
                   help="Quick camera preset (default: side).")

    p.add_argument("--size", type=int, default=int(os.getenv("THUMBNAIL_SIZE", "1024")),
                   help="Square PNG edge in pixels.")
    p.add_argument("--margin", type=float, default=float(os.getenv("THUMBNAIL_MARGIN", "0.04")),
                   help="Relative padding (e.g. 0.04 = 4%).")
    p.add_argument("--azim", type=float, default=float(os.getenv("THUMBNAIL_AZIM_DEG", "90")),
                   help="Azimuth degrees around +Z (0=+X, 90=+Y).")
    p.add_argument("--elev", type=float, default=float(os.getenv("THUMBNAIL_ELEV_DEG", "0")),
                   help="Elevation degrees from XY plane (+ up).")
    p.add_argument("--bg", default=os.getenv("THUMBNAIL_BG_RGB", "1.0,1.0,1.0"),
                   help="Background RGB 'r,g,b' in [0,1].")
    p.add_argument("--grey", type=float, default=float(os.getenv("MODEL_GREY", "0.85")),
                   help="Base monochrome albedo if model has no colors.")
    p.add_argument("--backend", choices=["auto", "pyrender", "plotly"],
                   default=os.getenv("THUMBNAIL_BACKEND", "auto"),
                   help="Rendering backend preference.")

    # Shading
    p.add_argument("--ambient", type=float, default=float(os.getenv("THUMBNAIL_AMBIENT", "0.55")))
    p.add_argument("--diffuse", type=float, default=float(os.getenv("THUMBNAIL_DIFFUSE", "0.45")))
    p.add_argument("--rim-k", type=float, default=float(os.getenv("THUMBNAIL_RIM_K", "0.06")))
    p.add_argument("--rim-p", type=float, default=float(os.getenv("THUMBNAIL_RIM_P", "2.2")))
    p.add_argument("--gamma", type=float, default=float(os.getenv("THUMBNAIL_GAMMA", "1.0")))
    p.add_argument("--light", default=os.getenv("THUMBNAIL_LIGHT_DIR", "0.30,0.20,1.0"),
                   help="Main directional light 'x,y,z'.")

    # In-plane orientation
    p.add_argument("--align", choices=["none", "plane"],
                   default=os.getenv("THUMBNAIL_ALIGN", "plane"),
                   help="Auto-align longest axis horizontally in camera plane.")
    # Default yaw +90°: after alignment, point to the right by default.
    p.add_argument("--yaw", type=float, default=float(os.getenv("THUMBNAIL_YAW_DEG", "90")),
                   help="Extra in-plane rotation (deg) after auto-align.")
    p.add_argument("--hflip", action="store_true",
                   help="Flip horizontally after alignment/yaw.")

    # Auto-level: fix the last tiny tilt
    p.add_argument("--level-mode", choices=["lower", "global", "none"],
                   default=os.getenv("THUMBNAIL_LEVEL_MODE", "lower"),
                   help="How to estimate tilt: lower-band (default), global, or none.")
    p.add_argument("--level-max-deg", type=float,
                   default=float(os.getenv("THUMBNAIL_LEVEL_MAX_DEG", "10")),
                   help="Max absolute correction in degrees (default 10).")
    p.add_argument("--level-band", type=float,
                   default=float(os.getenv("THUMBNAIL_LEVEL_BAND", "0.18")),
                   help="Lower-band height as fraction of image span (default 0.18).")
    return p.parse_args()

# ---- Geometry helpers --------------------------------------------------------
def spherical_to_cart(azim_deg: float, elev_deg: float, r: float) -> np.ndarray:
    az = np.deg2rad(azim_deg); el = np.deg2rad(elev_deg)
    return np.array([r*math.cos(el)*math.cos(az),
                     r*math.cos(el)*math.sin(az),
                     r*math.sin(el)], dtype=float)

def ortho_basis_from_view(azim_deg: float, elev_deg: float):
    f = spherical_to_cart(azim_deg, elev_deg, 1.0); f /= (np.linalg.norm(f) + 1e-12)
    up_hint = np.array([0.0, 0.0, 1.0], float)
    r = np.cross(f, up_hint)
    if np.linalg.norm(r) < 1e-9:
        up_hint = np.array([0.0, 1.0, 0.0], float)
        r = np.cross(f, up_hint)
    r /= (np.linalg.norm(r) + 1e-12); u = np.cross(r, f); u /= (np.linalg.norm(u) + 1e-12)
    return r, u, f

def bbox_corners(bmin, bmax):
    xs = [bmin[0], bmax[0]]; ys = [bmin[1], bmax[1]]; zs = [bmin[2], bmax[2]]
    return np.array([[x, y, z, 1.0] for x in xs for y in ys for z in zs], float)

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

def _rotate2d(x: np.ndarray, y: np.ndarray, theta: float):
    c, s = math.cos(theta), math.sin(theta)
    return c*x - s*y, s*x + c*y

def _plane_pca_angle(x: np.ndarray, y: np.ndarray) -> float:
    pts = np.column_stack([x, y]); cov = np.cov(pts.T)
    vals, vecs = np.linalg.eigh(cov); major = vecs[:, int(np.argmax(vals))]
    return math.atan2(major[1], major[0])

def _slope(x: np.ndarray, y: np.ndarray) -> float:
    varx = float(np.var(x)) + 1e-12
    covxy = float(np.cov(x, y)[0, 1])
    return covxy / varx

def _auto_level_delta_global(x: np.ndarray, y: np.ndarray) -> float:
    # Rotate by -atan(m) so slope->0
    return -math.atan(_slope(x, y))

def _auto_level_delta_lower(x: np.ndarray, y: np.ndarray, band_frac: float) -> float:
    """
    Fit a line to the lower band of points (waterline-ish).
    band_frac = fraction of (y.max()-y.min()) from y.min() to include.
    """
    if band_frac <= 0.0:
        return 0.0
    y_min, y_max = float(y.min()), float(y.max())
    band = y_min + band_frac * (y_max - y_min)
    mask = y <= band
    if mask.sum() < 16:  # too few; fall back to global
        return _auto_level_delta_global(x, y)
    return -math.atan(_slope(x[mask], y[mask]))

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
        ambient_light=np.array([0.35, 0.35, 0.35, 1.0], float),
        bg_color=np.array([bg_rgb[0], bg_rgb[1], bg_rgb[2], 1.0], float),
    )

    material = pyrender.MetallicRoughnessMaterial(
        baseColorFactor=[mono_grey, mono_grey, mono_grey, 1.0],
        metallicFactor=0.0, roughnessFactor=0.8, doubleSided=True,
    )
    pm = pyrender.Mesh.from_trimesh(mesh, material=material, smooth=False)
    scene.add(pm)

    cam_dist = radius * 4.0 + 1.0
    cam_pos = spherical_to_cart(azim_deg, elev_deg, cam_dist) + center

    def look_at(eye, target, up=np.array([0,0,1.0], float)):
        f = (target - eye); f /= (np.linalg.norm(f) + 1e-12)
        s = np.cross(f, up); s /= (np.linalg.norm(s) + 1e-12)
        u = np.cross(s, f)
        M = np.eye(4, float); M[:3,:3] = np.vstack([s, u, -f]); M[:3,3] = eye
        return M

    cam_pose = look_at(cam_pos, center)

    # Tight fit using camera-projected bbox corners
    corners = bbox_corners(bmin, bmax)
    T_wc = np.linalg.inv(cam_pose)
    cam_corners = (T_wc @ corners.T).T
    xs, ys, zvals = cam_corners[:, 0], cam_corners[:, 1], cam_corners[:, 2]
    half_w = 0.5 * (xs.max() - xs.min()); half_h = 0.5 * (ys.max() - ys.min())
    maxmag = max(half_w, half_h) * (1.0 + float(margin))
    near = max(1e-3, float(-(zvals.max()) - radius * 0.5))
    far  = max(near + 1e-3, float(-(zvals.min()) + radius * 0.5))

    camera = pyrender.OrthographicCamera(xmag=maxmag, ymag=maxmag, znear=near, zfar=far)
    scene.add(camera, pose=cam_pose)

    # Lights
    def dir_pose(dir3):
        d = np.asarray(dir3, float); d /= (np.linalg.norm(d) + 1e-12)
        z = -d
        x = np.cross(np.array([0,0,1.0], float), z)
        if np.linalg.norm(x) < 1e-6: x = np.array([1.0,0.0,0.0], float)
        x /= (np.linalg.norm(x) + 1e-12); y = np.cross(z, x)
        M = np.eye(4, float); M[:3,:3] = np.vstack([x, y, z]); M[:3,3] = cam_pos
        return M

    scene.add(pyrender.DirectionalLight(intensity=3.0),  pose=dir_pose([ 0.3,  0.2,  1.0]))
    scene.add(pyrender.DirectionalLight(intensity=1.2),  pose=dir_pose([-0.6, -0.2,  1.0]))
    scene.add(pyrender.DirectionalLight(intensity=0.8),  pose=dir_pose([-0.2,  0.8, -0.3]))

    r = pyrender.OffscreenRenderer(viewport_width=size, viewport_height=size)
    color, _ = r.render(scene, flags=pyrender.RenderFlags.RGBA)
    try: r.delete()
    except Exception: pass
    return color  # HxWx4 uint8

def render_with_plotly(mesh: trimesh.Trimesh, size: int, margin: float,
                       azim_deg: float, elev_deg: float, bg_rgb: tuple,
                       mono_grey: float, ambient: float, diffuse: float,
                       rim_k: float, rim_p: float, gamma: float,
                       light_dir_world: np.ndarray,
                       align_mode: str, yaw_deg: float, hflip: bool,
                       level_mode: str, level_max_deg: float, level_band: float) -> np.ndarray:
    import plotly.graph_objects as go

    # Ensure normals
    if mesh.vertex_normals is None or len(mesh.vertex_normals) == 0:
        mesh.rezero(); mesh.compute_vertex_normals()

    bmin, bmax = mesh.bounds
    center = 0.5 * (bmin + bmax)
    rel = mesh.vertices - center

    # Camera basis
    r_vec, u_vec, f_vec = ortho_basis_from_view(azim_deg, elev_deg)

    # Project to camera plane
    x_cam = rel @ r_vec
    y_cam = rel @ u_vec
    z_cam = rel @ f_vec

    # Center the 2D footprint
    x_cam -= 0.5 * (x_cam.min() + x_cam.max())
    y_cam -= 0.5 * (y_cam.min() + y_cam.max())

    # 2D PCA alignment
    if align_mode == "plane":
        theta = _plane_pca_angle(x_cam, y_cam)
        x_cam, y_cam = _rotate2d(x_cam, y_cam, -theta)

    # Manual yaw
    if abs(yaw_deg) > 1e-6:
        x_cam, y_cam = _rotate2d(x_cam, y_cam, math.radians(yaw_deg))

    # Auto-level: lower-band or global
    if level_mode != "none":
        if level_mode == "lower":
            delta = _auto_level_delta_lower(x_cam, y_cam, band_frac=max(0.0, min(0.5, level_band)))
        else:
            delta = _auto_level_delta_global(x_cam, y_cam)
        lim = math.radians(abs(level_max_deg))
        delta = max(-lim, min(lim, float(delta)))
        if abs(delta) > 1e-6:
            x_cam, y_cam = _rotate2d(x_cam, y_cam, delta)

    # Horizontal flip
    if hflip:
        x_cam = -x_cam

    # Recenter
    x_cam -= 0.5 * (x_cam.min() + x_cam.max())
    y_cam -= 0.5 * (y_cam.min() + y_cam.max())

    # Tight extents in 2D
    half_w = 0.5 * (x_cam.max() - x_cam.min())
    half_h = 0.5 * (y_cam.max() - y_cam.min())
    maxmag = max(half_w, half_h) * (1.0 + float(margin))
    maxmag = max(maxmag, 1e-6)

    faces = mesh.faces.astype(int)

    # Greyscale shading (ambient + diffuse + rim)
    n_world = mesh.vertex_normals
    L = np.asarray(light_dir_world, float); L /= (np.linalg.norm(L) + 1e-12)
    V = -f_vec
    ndotl = np.clip((n_world @ L), 0.0, 1.0)
    rim = np.power(np.clip(1.0 - (n_world @ V), 0.0, 1.0), rim_p)
    shade = np.clip(ambient + diffuse * ndotl + rim_k * rim, 0.0, 1.0)

    base = np.clip(mono_grey, 0.0, 1.0)
    col = np.power(base * shade, 1.0 / max(gamma, 1e-6))
    col_u8 = (np.clip(col, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    rgba = np.column_stack([col_u8, col_u8, col_u8, np.full_like(col_u8, 255, np.uint8)])

    fig = go.Figure(data=[go.Mesh3d(
        x=x_cam, y=y_cam, z=z_cam,  # z for depth ordering
        i=faces[:, 0], j=faces[:, 1], k=faces[:, 2],
        vertexcolor=rgba,
        flatshading=True, showscale=False,
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
    img = Image.fromarray(color_rgba, mode="RGBA")
    bg = Image.new("RGBA", (size, size), tuple(int(255*x) for x in (*bg_rgb, 1.0)))
    bg.alpha_composite(img)
    img_rgb = bg.convert("RGB")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img_rgb.save(out_path, format="PNG", optimize=True)
    with open(out_path, "rb") as f:
        if f.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError("Output is not a valid PNG (bad signature).")

# ---- Main -------------------------------------------------------------------
def main():
    args = parse_args()

    # Env-controlled flip without CLI
    if _env_truthy("THUMBNAIL_HFLIP", "0"):
        args.hflip = True

    # Presets
    if args.preset != "auto":
        if args.preset == "side":
            args.azim, args.elev = 90.0, 0.0
            args.margin = min(args.margin, 0.06)
        elif args.preset == "front":
            args.azim, args.elev = 0.0, 0.0
        elif args.preset == "iso":
            args.azim, args.elev = 45.0, 30.0

    try:
        bg = tuple(map(float, args.bg.split(","))); assert len(bg) == 3
        assert all(0.0 <= v <= 1.0 for v in bg)
    except Exception:
        raise SystemExit("Invalid --bg; expected 'r,g,b' with values in [0,1].")

    try:
        light = tuple(map(float, args.light.split(","))); assert len(light) == 3
    except Exception:
        raise SystemExit("Invalid --light; expected 'x,y,z' vector.")

    # Load mesh
    try:
        mesh = load_mesh_force_mesh(args.input)
    except Exception as e:
        hint = " (3MF may require `pip install meshio`)" if str(args.input).lower().endswith(".3mf") else ""
        raise SystemExit(f"Failed to load '{args.input}': {e}{hint}")

    # Backend order
    backend_order = {
        "auto":    (["plotly", "pyrender"] if not IS_DARWIN else ["plotly", "pyrender"]),
        "pyrender": ["pyrender"],
        "plotly":  ["plotly"],
    }[args.backend]

    last_err = None
    for be in backend_order:
        try:
            if be == "pyrender":
                color = render_with_pyrender(mesh, args.size, args.margin, args.azim, args.elev, bg, args.grey)
                if color.ndim != 3 or color.shape[2] != 4:
                    raise RuntimeError("pyrender returned unexpected buffer shape")
                if color.max() <= 2 and color.mean() < 1.0:
                    raise RuntimeError("pyrender produced an all-black frame")
                compose_and_write(color, args.output, args.size, bg)
                print(f"wrote: {args.output}  size: {Path(args.output).stat().st_size} bytes  shape: {args.size}x{args.size}  backend: pyrender")
                return
            else:
                color = render_with_plotly(
                    mesh, args.size, args.margin, args.azim, args.elev, bg, args.grey,
                    args.ambient, args.diffuse, args.rim_k, args.rim_p, args.gamma,
                    np.array(light, float),
                    args.align, args.yaw, args.hflip,
                    args.level_mode, args.level_max_deg, args.level_band
                )
                compose_and_write(color, args.output, args.size, bg)
                print(f"wrote: {args.output}  size: {Path(args.output).stat().st_size} bytes  shape: {args.size}x{args.size}  backend: plotly")
                return
        except Exception as e:
            last_err = e
            continue

    raise SystemExit(f"All backends failed. Last error: {last_err}")

if __name__ == "__main__":
    main()
