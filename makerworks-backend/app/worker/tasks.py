# app/worker/tasks.py
from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional, Dict, Any

log = logging.getLogger(__name__)


def _renderer_invocation() -> list[str]:
    """
    Prefer module form so Python resolves packages cleanly:
      python -m app.utils.render_thumbnail
    Fallback: absolute script path if provided via THUMBNAILER_SCRIPT.
    """
    env_script = (os.getenv("THUMBNAILER_SCRIPT") or "").strip()
    if env_script:
        p = Path(env_script)
        if not p.exists():
            raise FileNotFoundError(f"THUMBNAILER_SCRIPT not found: {p}")
        return [sys.executable, str(p)]
    return [sys.executable, "-m", "app.utils.render_thumbnail"]


def _thumbs_dir() -> Path:
    d = (os.getenv("THUMBNAILS_DIR") or "/thumbnails").strip()
    p = Path(d)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _public_url(model_id: str) -> str:
    prefix = (os.getenv("THUMBNAILS_URL_PREFIX") or "/thumbnails").rstrip("/")
    return f"{prefix}/{model_id}.png"


def _parse_backend(stdout: str) -> Optional[str]:
    for line in reversed(stdout.strip().splitlines()):
        m = re.search(r"\bbackend:\s*(plotly|pyrender|cpu|gpu)\b", line.lower())
        if m:
            return m.group(1)
    return None


def generate_model_previews(
    model_path: str,
    model_id: str,
    user_id: str,
    turntable_abs_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Synchronous thumbnail generation. No Celery required.
    Returns:
      {"status":"ok","thumbnail_path":..., "thumbnail_url":..., "backend":...}
      or {"status":"error", ...}
    """
    src = Path(model_path)
    if not src.exists():
        msg = f"model not found: {src}"
        log.warning(msg)
        return {"status": "error", "reason": msg}

    out_png = _thumbs_dir() / f"{model_id}.png"

    cmd = [
        *_renderer_invocation(),
        str(src), str(out_png),
        "--size", os.getenv("THUMBNAIL_SIZE", "1024"),
        "--margin", os.getenv("THUMBNAIL_FRAME_MARGIN", os.getenv("THUMBNAIL_MARGIN", "0.06")),
        "--backend", os.getenv("THUMBNAIL_BACKEND", "plotly"),
        "--azim", os.getenv("THUMBNAIL_AZIM_DEG", "90"),
        "--elev", os.getenv("THUMBNAIL_ELEV_DEG", "0"),
        "--ambient", os.getenv("THUMBNAIL_AMBIENT", "0.62"),
        "--diffuse", os.getenv("THUMBNAIL_DIFFUSE", "0.38"),
        "--rim-k", os.getenv("THUMBNAIL_RIM_K", "0.03"),
        "--rim-p", os.getenv("THUMBNAIL_RIM_P", "24"),
        "--gamma", os.getenv("THUMBNAIL_GAMMA", "1.10"),
        "--light", os.getenv("THUMBNAIL_LIGHT_DIR", "0.30,0.20,1.0"),
        "--bg", os.getenv("THUMBNAIL_FLATTEN_BG", "white"),
        "--grey", os.getenv("THUMBNAIL_GREY", "0.90"),
        # orientation helpers already default inside the script, but keep here if you override:
        "--align", os.getenv("THUMBNAIL_ALIGN", "plane"),
        "--yaw", os.getenv("THUMBNAIL_YAW_DEG", "90"),
        "--level-mode", os.getenv("THUMBNAIL_LEVEL_MODE", "lower"),
        "--level-max-deg", os.getenv("THUMBNAIL_LEVEL_MAX_DEG", "10"),
        "--level-band", os.getenv("THUMBNAIL_LEVEL_BAND", "0.18"),
    ]

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.setdefault("HEADLESS", "1")

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=int(os.getenv("THUMBNAIL_TIMEOUT", "120")), env=env)
    if proc.returncode != 0:
        return {
            "status": "error",
            "reason": "thumbnailer failed",
            "code": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "output_expected": str(out_png),
        }

    if not out_png.exists():
        return {"status": "error", "reason": f"thumbnail not found: {out_png}"}

    backend = _parse_backend(proc.stdout) or os.getenv("THUMBNAIL_BACKEND", "plotly")
    res: Dict[str, Any] = {
        "status": "ok",
        "thumbnail_path": str(out_png),
        "thumbnail_url": _public_url(model_id),
        "backend": backend,
        "size_px": int(os.getenv("THUMBNAIL_SIZE", "1024")),
    }

    # Turntable not implemented here (you said you don't use it)
    if turntable_abs_path:
        res["turntable"] = {"status": "skipped", "reason": "not implemented"}
    return res


# Optional: if Celery *is* installed, register a task wrapper for backwards compat.
try:  # pragma: no cover
    from . import celery_app as _celery_app  # type: ignore

    @_celery_app.task(name="app.worker.tasks.generate_model_previews", bind=True)
    def generate_model_previews_task(self, *a, **kw):
        return generate_model_previews(*a, **kw)
except Exception:
    pass
