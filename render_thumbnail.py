#!/usr/bin/env python3
import os
import sys
import math
import argparse
from pathlib import Path
import numpy as np
import trimesh

# ---- Headless GL backend (prefer EGL, allow override) ----
os.environ.setdefault("PYOPENGL_PLATFORM", os.environ.get("PYOPENGL_PLATFORM", "egl"))

import pyrender
from PIL import Image


def parse_args():
    p = argparse.ArgumentParser(description="Render STL/3MF to square PNG (orthographic, 1:1).")
    p.add_argument("input", help="Input .stl or .3mf")
    p.add_argument("output", help="Output .png")
    p.add_argument("--size", type=int, default=int(os.getenv("THUMBNAIL_SIZE", "1024")),
                   help="PNG edge size in pixels (square).")
    p.add_argument("--margin", type=float, default=float(os.getenv("THUMBNAIL_MARGIN", "0.06")),
                   help="Relative margin (e.g., 0.06 = 6%% padding on each side).")
    p.add_argument("--azim", type=float, default=float(os.getenv("THUMBNAIL_AZIM_DEG", "45")),
                   help="Azimuth in degrees around +Z (0 = +X, 90 = +Y).")
    p.add_argument("--elev", type=float, default=float(os.getenv("THUMBNAIL_ELEV_DEG", "25")),
                   help="Elevation in degrees from XY plane (+ up).")
    p.add_argument("--bg", default=os.getenv("THUMBNAIL_BG_RGB", "1.0,1.0,1.0"),
                   help="Background RGB as 'r,g,b' in [0,1].")
    p.add_argument("--grey", type=float, default=float(os.getenv("MODEL_GREY", "0.9")),
                   help="Monochrome albedo if model has no colors.")
    return p.parse_args()


def spherical_to_cart(azim_deg, elev_deg, r):
    az = np.deg2rad(azim_deg)
    el = np.deg2rad(elev_deg)
    x = r * math.cos(el) * math.cos(az)
    y = r * math.cos(el) * math.sin(az)
    z = r * math.sin(el)
    return np.array([x, y, z], dtype=float)


def look_at(eye, target, up=np.array([0.0, 0.0, 1.0], dtype=float)):
    f = (target - eye).astype(float)
    f /= (np.linalg.norm(f) + 1e-12)
    u = up.astype(float)
    u /= (np.linalg.norm(u) + 1e-12)
    s = np.cross(f, u)
    if np.linalg.norm(s) < 1e-9:
        # Eye is parallel to up; pick a sensible sideways axis
        u = np.array([0.0, 1.0, 0.0], dtype=float)
        s = np.cross(f, u)
    s /= (np.linalg.norm(s) + 1e-12)
    u = np.cross(s, f)
    M = np.eye(4, dtype=float)
    M[:3, :3] = np.vstack([s, u, -f])   # camera's world rotation
    M[:3, 3] = eye
    return M


def bbox_corners(bmin, bmax):
    xs = [bmin[0], bmax[0]]
    ys = [bmin[1], bmax[1]]
    zs = [bmin[2], bmax[2]]
    return np.array([[x, y, z, 1.0] for x in xs for y in ys for z in zs], dtype=float)


def load_mesh_force_mesh(path: str) -> trimesh.Trimesh:
    """
    Always return a single Trimesh. Works for STL and 3MF (3MF requires meshio installed).
    """
    m = trimesh.load(path, force='mesh')
    if isinstance(m, trimesh.Trimesh):
        return m
    # If a Scene sneaks through, concatenate its geometry
    if isinstance(m, trimesh.Scene):
        dumps = m.dump()  # iterable of Trimesh
        meshes = []
        for sub in dumps:
            if isinstance(sub, trimesh.Trimesh):
                meshes.append(sub)
        if not meshes:
            raise RuntimeError("Loaded scene has no mesh geometry.")
        return trimesh.util.concatenate(meshes)
    raise RuntimeError(f"Unsupported mesh type: {type(m)}")


def render(input_path: str, output_path: str, size: int, margin: float,
           azim_deg: float, elev_deg: float, bg_rgb: tuple, mono_grey: float):
    # ---- Load geometry (STL / 3MF) ----
    try:
        mesh = load_mesh_force_mesh(input_path)
    except Exception as e:
        hint = ""
        if str(input_path).lower().endswith(".3mf"):
            hint = " (3MF may require `pip install meshio`)"
        raise RuntimeError(f"Failed to load '{input_path}': {e}{hint}")

    if mesh.is_empty:
        raise RuntimeError("Mesh has no triangles.")

    # World-space bounds, center, and a loose radius
    bmin, bmax = mesh.bounds
    center = 0.5 * (bmin + bmax)
    extents = (bmax - bmin)
    radius = float(np.linalg.norm(extents)) * 0.5
    radius = max(radius, 1e-6)

    # ---- Build pyrender scene ----
    scene = pyrender.Scene(
        ambient_light=np.array([0.3, 0.3, 0.3, 1.0], dtype=float),
        bg_color=np.array([bg_rgb[0], bg_rgb[1], bg_rgb[2], 1.0], dtype=float),
    )

    # Material: prefer mesh colors; otherwise monochrome
    material = pyrender.MetallicRoughnessMaterial(
        baseColorFactor=[mono_grey, mono_grey, mono_grey, 1.0],
        metallicFactor=0.0,
        roughnessFactor=0.8,
        doubleSided=True,
    )
    # If the mesh has per-vertex/face colors, pyrender will use them from Trimesh visual
    pm = pyrender.Mesh.from_trimesh(mesh, material=material, smooth=False)
    scene.add(pm)

    # ---- Camera pose (distance irrelevant for ortho, but keep sane near/far) ----
    cam_dist = radius * 4.0 + 1.0
    cam_pos = spherical_to_cart(azim_deg, elev_deg, cam_dist) + center
    cam_pose = look_at(cam_pos, center)

    # Compute required xmag/ymag from the model's **projected** bounds
    # Use bbox corners for robustness (tight enough, avoids iterating all vertices).
    corners = bbox_corners(bmin, bmax)  # (8,4) homogeneous
    T_wc = np.linalg.inv(cam_pose)      # world->camera
    cam_corners = (T_wc @ corners.T).T  # (8,4)
    xs = cam_corners[:, 0]
    ys = cam_corners[:, 1]
    half_w = 0.5 * (xs.max() - xs.min())
    half_h = 0.5 * (ys.max() - ys.min())

    # Apply symmetric margin
    scale = (1.0 + float(margin))
    xmag = max(half_w * scale, 1e-6)
    ymag = max(half_h * scale, 1e-6)

    # Keep square framing by expanding the smaller mag (no stretching)
    maxmag = max(xmag, ymag)
    xmag = maxmag
    ymag = maxmag

    # Near/far that comfortably bracket the model
    zvals = cam_corners[:, 2]
    # Camera looks down -Z; distances are positive along -Z
    near = max(1e-3, float(-(zvals.max()) - radius * 0.5))
    far  = max(near + 1e-3, float(-(zvals.min()) + radius * 0.5))

    camera = pyrender.OrthographicCamera(xmag=xmag, ymag=ymag, znear=near, zfar=far)
    scene.add(camera, pose=cam_pose)

    # ---- Lighting (three-point, oriented to the camera) ----
    def dir_pose(dir3):
        d = np.asarray(dir3, dtype=float)
        d /= (np.linalg.norm(d) + 1e-12)
        z = -d
        x = np.cross(np.array([0, 0, 1.0], dtype=float), z)
        if np.linalg.norm(x) < 1e-6:
            x = np.array([1.0, 0.0, 0.0], dtype=float)
        x /= (np.linalg.norm(x) + 1e-12)
        y = np.cross(z, x)
        M = np.eye(4, dtype=float)
        M[:3, :3] = np.vstack([x, y, z])
        M[:3, 3] = cam_pos  # place light near camera
        return M

    scene.add(pyrender.DirectionalLight(intensity=3.0),  pose=dir_pose([ 0.3,  0.2,  1.0]))
    scene.add(pyrender.DirectionalLight(intensity=1.2),  pose=dir_pose([-0.6, -0.2,  1.0]))
    scene.add(pyrender.DirectionalLight(intensity=0.8),  pose=dir_pose([-0.2,  0.8, -0.3]))

    # ---- Render ----
    r = pyrender.OffscreenRenderer(viewport_width=size, viewport_height=size)
    color, _ = r.render(scene, flags=pyrender.RenderFlags.RGBA)

    # Composite to opaque background (no alpha surprises)
    img = Image.fromarray(color, mode="RGBA")
    bg = Image.new("RGBA", (size, size), tuple(int(255*x) for x in (*bg_rgb, 1)))
    bg.alpha_composite(img)
    img = bg.convert("RGB")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="PNG")
    print(f"wrote: {output_path}  size: {Path(output_path).stat().st_size} bytes  shape: {img.size}")


def main():
    args = parse_args()
    try:
        bg = tuple(map(float, args.bg.split(",")))
        if len(bg) != 3:
            raise ValueError
    except Exception:
        raise SystemExit("Invalid --bg; expected 'r,g,b' with values in [0,1].")

    render(args.input, args.output, args.size, args.margin, args.azim, args.elev, bg, args.grey)


if __name__ == "__main__":
    main()
