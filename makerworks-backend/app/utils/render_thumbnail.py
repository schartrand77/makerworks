import logging
import os
import shutil
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
import numpy as np

from app.config.settings import settings

logger = logging.getLogger(__name__)

# ---------- Directories ----------
# Originals live under /uploads/... (handled elsewhere). Thumbnails are a flat library keyed by DB id.

# Uploads root (not used for output here, but kept for parity/debug)
_env_uploads = os.getenv("UPLOADS_DIR")
if _env_uploads:
    UPLOADS_DIR = Path(_env_uploads).resolve()
else:
    _default_uploads = Path(getattr(settings, "uploads_path", "/uploads")).resolve()
    # Prefer repo-local ./uploads when running outside docker and settings points at /app
    if _default_uploads.parts[:2] == ("/", "app") and not os.getenv("DOCKERIZED"):
        BASE_DIR = Path(__file__).resolve().parents[2]  # app/utils -> app -> repo root
        UPLOADS_DIR = (BASE_DIR / "uploads").resolve()
    else:
        UPLOADS_DIR = _default_uploads
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Thumbnails root
_env_thumbs = os.getenv("THUMBNAILS_DIR")
if _env_thumbs:
    THUMBNAILS_DIR = Path(_env_thumbs).resolve()
else:
    _default_thumbs = Path(getattr(settings, "thumbnails_path", "/thumbnails")).resolve()
    if _default_thumbs.parts[:2] == ("/", "app") and not os.getenv("DOCKERIZED"):
        BASE_DIR = Path(__file__).resolve().parents[2]
        THUMBNAILS_DIR = (BASE_DIR / "thumbnails").resolve()
    else:
        THUMBNAILS_DIR = _default_thumbs
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# Prefer headless EGL; fall back to OSMesa if needed
if "PYOPENGL_PLATFORM" not in os.environ:
    os.environ["PYOPENGL_PLATFORM"] = "egl"

MAX_THUMBNAIL_RATIO = 0.5  # thumbnail must be <= 50% of model file size


def _render_fallback(output_path: Path, size=(1024, 1024)):
    """Generate a simple 'No Preview' placeholder."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bg = Image.new("RGBA", size, (245, 245, 245, 255))
    draw = ImageDraw.Draw(bg)
    draw.text((size[0] * 0.3, size[1] * 0.45), "No Preview", fill=(80, 80, 80, 255))
    bg.save(output_path, "PNG", optimize=True)
    logger.warning(f"[Thumbnail] ⚠️ Using fallback placeholder → {output_path}")


def _apply_gamma(image: Image.Image, gamma=1.8) -> Image.Image:
    arr = np.asarray(image, dtype=np.float32) / 255.0
    arr = np.power(arr, 1 / gamma) * 255.0
    return Image.fromarray(arr.astype(np.uint8))


def _try_render(model_path: Path, output_path: Path, size=(1024, 1024)) -> str:
    """Render STL/3MF preview into temp file then atomically move to output path."""
    import trimesh
    import pyrender

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_file = Path(tempfile.gettempdir()) / (output_path.name + ".tmp")
    final_path = output_path

    mesh = trimesh.load(str(model_path), force="mesh")
    if mesh.is_empty:
        _render_fallback(tmp_file, size)
        shutil.move(str(tmp_file), str(final_path))
        return str(final_path)

    # Normalize pose
    mesh.apply_translation(-mesh.center_mass)
    if max(mesh.extents) > 0:
        mesh.apply_scale(1.0 / max(mesh.extents))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.radians(-90), [1, 0, 0]))
    bbox = mesh.bounds
    center = mesh.centroid
    mesh.apply_translation(-center + [0, 0, -0.05])

    extents = bbox[1] - bbox[0]
    max_extent = float(max(extents))
    margin = 1.15
    xmag = max_extent * margin
    ymag = max_extent * margin

    scene = pyrender.Scene(bg_color=[0, 0, 0, 0])
    material = pyrender.MetallicRoughnessMaterial(
        baseColorFactor=[0.5, 0.5, 0.5, 1.0],
        metallicFactor=0.0,
        roughnessFactor=1.0,
    )
    scene.add(pyrender.Mesh.from_trimesh(mesh, material=material, smooth=True))

    # Lighting
    scene.ambient_light = np.array([0.25, 0.25, 0.25, 1.0])
    light_color = np.array([1.0, 1.0, 1.0])
    key_pose = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 2], [0, 0, 0, 1]]
    fill_pose = [[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 1.5], [0, 0, 0, 1]]
    back_pose = [[-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, -1, 1.5], [0, 0, 0, 1]]

    scene.add(pyrender.DirectionalLight(color=light_color, intensity=1.0), pose=key_pose)
    scene.add(pyrender.DirectionalLight(color=light_color, intensity=0.5), pose=fill_pose)
    scene.add(pyrender.DirectionalLight(color=light_color, intensity=0.4), pose=back_pose)

    camera = pyrender.OrthographicCamera(xmag=xmag, ymag=ymag)
    cam_pose = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 2.5],
            [0.0, 0.0, 0.0, 1.0],
        ]
    )
    scene.add(camera, pose=cam_pose)

    high_res = (size[0] * 4, size[1] * 4)
    r = pyrender.OffscreenRenderer(*high_res)
    color, _ = r.render(scene)
    r.delete()

    model_img = Image.fromarray(color).convert("RGBA")
    model_img = model_img.resize(size, Image.LANCZOS)
    model_img = _apply_gamma(model_img, gamma=1.8)

    # Soft gradient background
    bg = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(bg)
    top_color = (255, 248, 245, 255)
    bottom_color = (230, 235, 240, 255)
    for y in range(size[1]):
        blend = y / size[1]
        r_c = int(top_color[0] * (1 - blend) + bottom_color[0] * blend)
        g_c = int(top_color[1] * (1 - blend) + bottom_color[1] * blend)
        b_c = int(top_color[2] * (1 - blend) + bottom_color[2] * blend)
        draw.line([(0, y), (size[0], y)], fill=(r_c, g_c, b_c, 255))
    bg = bg.filter(ImageFilter.GaussianBlur(0.6))

    bg.alpha_composite(model_img)
    bg.save(tmp_file, "PNG", optimize=True)

    shutil.move(str(tmp_file), str(final_path))
    return str(final_path)


def render_thumbnail(model_path: Path, model_id: str, size=(1024, 1024)) -> str:
    """
    Render a thumbnail for `model_path` into the thumbnails library keyed by `model_id`.
    Output path is forced to: THUMBNAILS_DIR / f"{model_id}.png"
    Returns the absolute filesystem path as a string.
    """
    model_path = Path(model_path)
    final_path = (THUMBNAILS_DIR / f"{model_id}.png").resolve()

    start_time = time.time()
    model_size = model_path.stat().st_size if model_path.exists() else 0
    attempt_size = size

    try:
        while True:
            try:
                result = _try_render(model_path, final_path, attempt_size)
            except Exception as egl_err:
                logger.error(f"[Thumbnail] EGL rendering failed: {egl_err}")
                os.environ["PYOPENGL_PLATFORM"] = "osmesa"
                result = _try_render(model_path, final_path, attempt_size)

            thumb_size = final_path.stat().st_size if final_path.exists() else 0
            if thumb_size <= model_size * MAX_THUMBNAIL_RATIO or attempt_size[0] <= 64:
                return result

            attempt_size = (attempt_size[0] // 2, attempt_size[1] // 2)
            logger.info(f"[Thumbnail] 🔄 Re-rendering at {attempt_size} to meet size budget")
    except Exception as e:
        logger.exception(f"[Thumbnail] Generation failed: {e}")
        _render_fallback(final_path, attempt_size)
        return str(final_path)
    finally:
        elapsed = time.time() - start_time
        logger.info(f"[Thumbnail] ✅ Thumbnail completed in {elapsed:.2f}s → {final_path}")


# Back-compat wrapper: if someone insists on calling it with a fake "output path"
def ensure_thumbnail(model_path: Path, model_id_or_path, size=(1024, 1024)) -> str:
    """
    If the second arg looks like an id, use it. If it's a Path, use its stem as id.
    """
    if isinstance(model_id_or_path, (str, bytes)):
        model_id = str(model_id_or_path)
    else:
        p = Path(model_id_or_path)
        model_id = p.stem
    return render_thumbnail(model_path, model_id, size=size)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python render_thumbnail.py <model_path> <model_id>")
        sys.exit(1)
    model_path = Path(sys.argv[1])
    model_id = sys.argv[2]
    print(render_thumbnail(model_path, model_id))
