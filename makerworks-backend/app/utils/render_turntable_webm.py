# app/utils/render_turntable_webm.py
import logging
from pathlib import Path
import numpy as np
import trimesh
import imageio.v3 as iio

logger = logging.getLogger(__name__)

def render_turntable_webm(model_path: Path, output_path: Path, frames: int = 72, size=(512, 512), fps: int = 24) -> bool:
    """
    Generate a WebM turntable preview of a 3D model using trimesh.
    Saves output to `output_path` as VP9-encoded WebM.
    """
    try:
        logger.info(f"[TurntableWebM] Generating WebM turntable for {model_path}")

        mesh = trimesh.load(str(model_path), force='mesh')
        if mesh.is_empty:
            logger.warning(f"[TurntableWebM] Empty mesh: {model_path}")
            return False

        scene = mesh.scene()
        centroid = scene.centroid

        angles = np.linspace(0, 360, frames, endpoint=False)
        images = []

        for angle in angles:
            transform = trimesh.transformations.rotation_matrix(
                np.radians(angle), [0, 1, 0], centroid
            )
            scene.camera_transform = transform

            png_bytes = scene.save_image(resolution=size, visible=False)
            if png_bytes:
                images.append(iio.imread(png_bytes))

        if not images:
            logger.warning(f"[TurntableWebM] No frames generated for {model_path}")
            return False

        iio.imwrite(output_path, images, fps=fps, codec='vp9')

        logger.info(f"[TurntableWebM] ✅ Saved WebM turntable to {output_path}")
        return True

    except Exception as e:
        logger.exception(f"[TurntableWebM] ❌ Failed to generate WebM for {model_path}: {e}")
        return False
