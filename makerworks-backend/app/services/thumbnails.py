# app/services/thumbnails.py
from pathlib import Path
import subprocess, sys

def render_model_thumbnail(input_path: Path, output_path: Path, size: int = 1024, backend: str = "cpu"):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "app.utils.render_thumbnail",
        str(input_path), str(output_path),
        "--backend", backend,
        "--size", str(size),
    ]
    subprocess.run(cmd, check=True)
    return output_path
