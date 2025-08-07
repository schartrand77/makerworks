import subprocess
import sys
from pathlib import Path
from PIL import Image


def test_generate_sample_image(tmp_path):
    script = Path(__file__).resolve().parent.parent / "generate_sample_images.py"
    subprocess.run([sys.executable, str(script)], cwd=tmp_path, check=True)
    out_file = tmp_path / "sample.png"
    assert out_file.exists(), "sample.png was not created"
    with Image.open(out_file) as img:
        assert img.size == (512, 512)
        assert img.mode == "RGB"
