# /app/worker/tasks.py

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

from . import celery_app  # your shared Celery() instance

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Locating the renderer (module-first, then file path, then env)
# ──────────────────────────────────────────────────────────────────────────────
def _resolve_renderer_invocation() -> list[str]:
    """
    Prefer running the renderer as a module to avoid path shenanigans:
        python -m app.utils.render_thumbnail
    If that import fails, fall back to a file path:
        {sys.executable} /app/utils/render_thumbnail.py

    You can override with THUMBNAILER_SCRIPT=/abs/path/to/render_thumbnail.py
    """
    # 1) Explicit env override
    env_script = os.getenv("THUMBNAILER_SCRIPT", "").strip()
    if env_script:
        p = Path(env_script)
        if not p.exists():
            raise FileNotFoundError(f"THUMBNAILER_SCRIPT points to missing file: {p}")
        return [sys.executable, str(p)]

    # 2) Try module mode
    try:
        import importlib
        mod = importlib.import_module("app.utils.render_thumbnail")
        # If that worked, we can run it via -m (preferred)
        return [sys.executable, "-m", "app.utils.render_thumbnail"]
    except Exception:
        pass

    # 3) Fallback to the conventional path: /app/utils/render_thumbnail.py
    # (worker is /app/worker/..., so go up one and into utils)
    here = Path(__file__).resolve()
    root = here.parents[1]  # /app
    candidate = root / "utils" / "render_thumbnail.py"
    if not candidate.exists():
        raise FileNotFoundError(
            f"render_thumbnail.py not found. Looked at {candidate}. "
            "Set THUMBNAILER_SCRIPT to an absolute path or ensure app.utils is importable."
        )
    return [sys.executable, str(candidate)]


def _compute_output_path(model_path: Path, model_id: str, user_id: str) -> Path:
    """
    Decide where the thumbnail goes.

    If THUMBNAIL_ROOT=/some/dir is set:
        /some/dir/{user_id}/{model_id}/{model_stem}_thumb.png
    else:
        {model_dir}/{model_stem}_thumb.png
    """
    root = os.getenv("THUMBNAIL_ROOT", "").strip()
    stem = model_path.stem
    if root:
        out_dir = Path(root) / user_id / model_id
    else:
        out_dir = model_path.parent

    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{stem}_thumb.png"


def _default_args_from_env() -> dict:
    """
    Pull tunables from env, with your 'perfect' Benchy look as defaults.
    """
    return {
        "size": int(os.getenv("THUMBNAIL_SIZE", "1024")),
        "margin": os.getenv("THUMBNAIL_MARGIN", "0.06"),
        "backend": os.getenv("THUMBNAIL_BACKEND", "auto"),  # auto -> GPU if wgpu/pygfx present
        "azim": os.getenv("THUMBNAIL_AZIM_DEG", "90"),
        "elev": os.getenv("THUMBNAIL_ELEV_DEG", "0"),
        "rim": os.getenv("THUMBNAIL_RIM", "0.6"),
        "rim_power": os.getenv("THUMBNAIL_RIM_POWER", "2.5"),
        "diffuse": os.getenv("THUMBNAIL_DIFFUSE", "0.9"),
        "ambient": os.getenv("THUMBNAIL_AMBIENT", "0.3"),
        # Optional background/grey overrides:
        "bg": os.getenv("THUMBNAIL_BG_RGB", "1.0,1.0,1.0"),
        "grey": os.getenv("MODEL_GREY", "0.9"),
    }


def _parse_backend_from_stdout(stdout: str) -> Optional[str]:
    """
    Our renderer prints a trailing line like:
        backend: gpu
    Try to pull that out, otherwise None.
    """
    for line in reversed(stdout.strip().splitlines()):
        m = re.search(r"\bbackend:\s*(cpu|gpu)\b", line.lower())
        if m:
            return m.group(1)
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Celery Task
# ──────────────────────────────────────────────────────────────────────────────
@celery_app.task(name="app.worker.tasks.generate_model_previews", bind=True)
def generate_model_previews(
    self,
    model_path: str,
    model_id: str,
    user_id: str,
    turntable_abs_path: Optional[str] = None,
):
    """
    Generate a square orthographic thumbnail for an STL/3MF, Benchy-style.
    Runs the renderer as a subprocess with GPU-if-available (wgpu/pygfx) or CPU fallback.

    Returns dict:
      {
        "status": "ok" | "error",
        "thumbnail_path": "...",
        "backend": "gpu" | "cpu" | None,
        "size_px": 1024,
        ...
      }
    """
    log.info(
        "🧵 generate_model_previews: model_id=%s user_id=%s path=%s",
        model_id, user_id, model_path
    )

    p = Path(model_path)
    if not p.exists():
        msg = f"model not found at {model_path}"
        log.warning(msg)
        return {"status": "error", "reason": msg}

    try:
        renderer_invocation = _resolve_renderer_invocation()
    except Exception as e:
        log.exception("renderer resolve failed")
        return {"status": "error", "reason": str(e)}

    out_png = _compute_output_path(p, model_id, user_id)
    args = _default_args_from_env()

    cmd = [
        *renderer_invocation,
        str(p), str(out_png),
        "--size", str(args["size"]),
        "--margin", str(args["margin"]),
        "--backend", str(args["backend"]),
        "--azim", str(args["azim"]),
        "--elev", str(args["elev"]),
        "--rim", str(args["rim"]),
        "--rim-power", str(args["rim_power"]),
        "--diffuse", str(args["diffuse"]),
        "--ambient", str(args["ambient"]),
        "--bg", str(args["bg"]),
        "--grey", str(args["grey"]),
    ]

    log.debug("thumbnail cmd: %s", " ".join(map(str, cmd)))

    # Run the renderer isolated from the worker process (keeps GL/Metal out of our RAM)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    ok = (proc.returncode == 0)

    if not ok:
        log.error(
            "thumbnailer failed rc=%s\nSTDOUT:\n%s\nSTDERR:\n%s",
            proc.returncode, proc.stdout, proc.stderr
        )
        return {
            "status": "error",
            "reason": "thumbnailer failed",
            "code": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "output_expected": str(out_png),
        }

    if not out_png.exists():
        msg = f"thumbnailer returned 0 but file missing: {out_png}"
        log.error(msg)
        return {"status": "error", "reason": msg}

    backend = _parse_backend_from_stdout(proc.stdout) or os.getenv("THUMBNAIL_BACKEND", "auto")
    log.info("✅ thumbnail generated at %s (backend=%s)", out_png, backend)

    result = {
        "status": "ok",
        "thumbnail_path": str(out_png),
        "backend": backend,
        "size_px": args["size"],
    }

    # Optional future: turntable renderer
    if turntable_abs_path:
        result["turntable"] = {"status": "skipped", "reason": "turntable not implemented yet"}

    return result
