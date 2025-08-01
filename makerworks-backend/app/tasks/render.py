import logging
from pathlib import Path

from app.worker import celery_app
from app.config.settings import settings

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="generate_gcode")
def generate_gcode(self, model_id: int, estimate_id: int):
    """Generate a simple G-code file for a model/estimate pair.

    The task writes a basic square path to ``uploads/gcode``. This is not a
    full slicer implementation but provides functional output for testing.
    """

    logger.info(
        "[TASK] Generating G-code for model %s, estimate %s", model_id, estimate_id
    )

    gcode_dir = Path(settings.uploads_path) / "gcode"
    gcode_dir.mkdir(parents=True, exist_ok=True)
    output_path = gcode_dir / f"{model_id}_{estimate_id}.gcode"

    try:
        with output_path.open("w") as fh:
            fh.write("; MakerWorks auto-generated G-code\n")
            fh.write("G90 ; absolute positioning\n")
            fh.write("M82 ; absolute extrusion\n")
            for layer in range(5):
                z = layer * 0.2
                fh.write(f"G1 Z{z:.2f} F3000\n")
                fh.write("G1 X0 Y0\n")
                fh.write("G1 X10 Y0\n")
                fh.write("G1 X10 Y10\n")
                fh.write("G1 X0 Y10\n")
                fh.write("G1 X0 Y0\n")
            fh.write("M104 S0\n")
            fh.write("M140 S0\n")
            fh.write("M84\n")
        logger.info("✅ G-code generated: %s", output_path)
        return str(output_path)
    except Exception as exc:
        logger.exception("❌ G-code generation failed")
        raise exc
