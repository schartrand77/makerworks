# app/utils/render_turntable.py
import logging
from pathlib import Path
import numpy as np
import trimesh
import imageio.v3 as iio

logger = logging.getLogger(__name__)

def render_turntable(model_path: Path, output_path: Path, frames: int = 36, size=(512, 512)) -> dict:
    """
    Generate a rotating WEBM turntable preview of a 3D model using trimesh.
    - Headless/offscreen rendering
    - Auto camera framing and centering
    - VisionOS-style neutral lighting and clean background

    Args:
        model_path: Path to STL/3MF/OBJ model
        output_path: Desired WEBM output path
        frames: Number of frames in the rotation
        size: Frame resolution (tuple)

    Returns:
        dict: { "status": "done"|"failed", "turntable": "<path>" }
    """
    try:
        logger.info(f"[Turntable] Generating turntable for {model_path}")

        mesh = trimesh.load(str(model_path), force='mesh')
        if mesh.is_empty:
            logger.warning(f"[Turntable] Empty mesh: {model_path}")
            return {"status": "failed"}

        # ✅ Normalize model orientation and center it
        mesh.apply_translation(-mesh.center_mass)
        mesh.apply_scale(1.0 / max(mesh.extents))  # Scale to unit size

        scene = mesh.scene()
        scene.set_camera(angles=(0, 0, 0), distance=2.5, center=(0, 0, 0))

        # ✅ Add neutral 3-point lighting
        if hasattr(scene, 'lights'):
            scene.lights = []
        light_directions = [
            np.array([1, 1, 1]),
            np.array([-1, -0.5, 1]),
            np.array([0, -1, 0.5])
        ]
        for direction in light_directions:
            scene.lights.append(trimesh.scene.lighting.DirectionalLight(
                direction=direction / np.linalg.norm(direction),
                color=[1.0, 1.0, 1.0],
                intensity=1.0
            ))

        angles = np.linspace(0, 360, frames, endpoint=False)
        images = []

        for angle in angles:
            transform = trimesh.transformations.rotation_matrix(
                np.radians(angle), [0, 1, 0], [0, 0, 0]
            )
            scene.camera_transform = transform

            png_bytes = scene.save_image(
                resolution=size,
                visible=False,
                background=[255, 255, 255, 255]
            )
            if png_bytes:
                images.append(iio.imread(png_bytes))

        if not images:
            logger.warning(f"[Turntable] No frames generated for {model_path}")
            return {"status": "failed"}

        output_path = Path(output_path).with_suffix(".webm")
        iio.imwrite(output_path, images, codec="libvpx-vp9", fps=24)

        logger.info(f"[Turntable] ✅ Saved WEBM turntable to {output_path}")
        return {"status": "done", "turntable": str(output_path)}

    except Exception as e:
        logger.exception(f"[Turntable] ❌ Failed to generate turntable for {model_path}: {e}")
        return {"status": "error", "error": str(e)}
