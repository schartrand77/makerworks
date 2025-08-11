# app/core/security.py
from __future__ import annotations

import base64
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import jwt  # PyJWT

logger = logging.getLogger(__name__)

# Settings import – tolerate old/new locations
try:
    from app.core.config import settings as _settings  # preferred
except Exception:  # pragma: no cover
    from app.config.settings import settings as _settings  # legacy

settings = _settings  # alias


# -------- helpers --------
def _get(*names: str, default: Any = None) -> Any:
    for n in names:
        try:
            val = getattr(settings, n)
        except Exception:
            continue
        if val not in (None, ""):
            return val
    return default

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _resolve_algorithm() -> str:
    alg = _get("JWT_ALG", "jwt_alg_alt", "JWT_ALGORITHM", "jwt_algorithm_raw", "algorithm", default="HS256")
    return str(alg).upper()

def _resolve_issuer() -> Optional[str]:
    return _get("JWT_ISSUER", "jwt_issuer", default=None)

def _resolve_audience() -> Optional[str]:
    return _get("JWT_AUDIENCE", "jwt_audience", default=None)

def _resolve_exp_minutes() -> int:
    return int(_get("JWT_EXPIRES_MIN", "jwt_expires_min", default=60))

def _resolve_refresh_days() -> int:
    return int(_get("JWT_REFRESH_EXPIRES_DAYS", "jwt_refresh_expires_days", default=14))

def _resolve_leeway_seconds() -> int:
    return int(os.getenv("JWT_LEEWAY_SEC", "0"))

def _resolve_kid() -> Optional[str]:
    return os.getenv("JWT_KID") or None

def _read_text(path: str) -> str:
    return Path(path).read_text()

def _maybe_b64_secret(secret: str) -> str:
    env_b64 = os.getenv("JWT_SECRET_BASE64") or os.getenv("JWT_SECRET_B64")
    if env_b64:
        return base64.b64decode(env_b64.encode()).decode()
    if secret.startswith("base64:"):
        return base64.b64decode(secret.split("base64:", 1)[1].encode()).decode()
    return secret


# -------- key resolution (tiny cache) --------
_KEYS_CACHE: Dict[str, Any] = {"alg": None, "sign": None, "verify": None, "priv_mtime": None, "pub_mtime": None}

def _resolve_keys() -> Tuple[str, str, str]:
    alg = _resolve_algorithm()

    if alg.startswith("HS"):
        secret = _get("JWT_SECRET", "jwt_secret", default=None)
        if not secret:
            raise RuntimeError("JWT_SECRET is required for HS* algorithms but is not set.")
        secret = _maybe_b64_secret(str(secret))
        if _KEYS_CACHE.get("alg") != alg or _KEYS_CACHE.get("sign") != secret:
            _KEYS_CACHE.update({"alg": alg, "sign": secret, "verify": secret})
        return alg, _KEYS_CACHE["sign"], _KEYS_CACHE["verify"]

    if alg.startswith("RS"):
        priv_path = _get("JWT_PRIVATE_KEY_PATH", "jwt_private_key_path", default=None)
        pub_path = _get("JWT_PUBLIC_KEY_PATH", "jwt_public_key_path", default=None)
        if not priv_path or not pub_path:
            raise RuntimeError("RS* requires JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH.")
        priv_p, pub_p = Path(str(priv_path)), Path(str(pub_path))
        priv_m = priv_p.stat().st_mtime if priv_p.exists() else None
        pub_m = pub_p.stat().st_mtime if pub_p.exists() else None
        needs_reload = (
            _KEYS_CACHE.get("alg") != alg
            or _KEYS_CACHE.get("priv_mtime") != priv_m
            or _KEYS_CACHE.get("pub_mtime") != pub_m
        )
        if needs_reload:
            try:
                priv, pub = priv_p.read_text(), pub_p.read_text()
            except Exception as e:  # pragma: no cover
                raise RuntimeError(f"Failed to read RSA key files: {e}") from e
            _KEYS_CACHE.update({"alg": alg, "sign": priv, "verify": pub, "priv_mtime": priv_m, "pub_mtime": pub_m})
        return alg, _KEYS_CACHE["sign"], _KEYS_CACHE["verify"]

    raise RuntimeError(f"Unsupported JWT algorithm: {alg}")


# -------- public API --------
def create_access_token(subject: str, extra: Optional[Dict[str, Any]] = None) -> str:
    alg, sign_key, _ = _resolve_keys()
    now, exp = _now(), _now() + timedelta(minutes=_resolve_exp_minutes())
    payload: Dict[str, Any] = {"sub": subject, "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    iss, aud = _resolve_issuer(), _resolve_audience()
    if iss: payload["iss"] = iss
    if aud: payload["aud"] = aud
    if extra: payload.update(extra)
    headers: Dict[str, Any] = {}
    kid = _resolve_kid()
    if kid: headers["kid"] = kid
    token = jwt.encode(payload, sign_key, algorithm=alg, headers=headers or None)
    logger.debug("Issued access token: alg=%s sub=%s exp=%s", alg, subject, exp.isoformat())
    return token

def create_refresh_token(subject: str) -> str:
    alg, sign_key, _ = _resolve_keys()
    now, exp = _now(), _now() + timedelta(days=_resolve_refresh_days())
    payload: Dict[str, Any] = {"sub": subject, "typ": "refresh", "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    iss, aud = _resolve_issuer(), _resolve_audience()
    if iss: payload["iss"] = iss
    if aud: payload["aud"] = aud
    headers: Dict[str, Any] = {}
    kid = _resolve_kid()
    if kid: headers["kid"] = kid
    return jwt.encode(payload, sign_key, algorithm=alg, headers=headers or None)

def decode_token(token: str) -> Dict[str, Any]:
    alg, _, verify_key = _resolve_keys()
    opts = {"require": ["exp", "iat", "sub"], "verify_aud": _resolve_audience() is not None}
    return jwt.decode(
        token,
        verify_key,
        algorithms=[alg],
        audience=_resolve_audience(),
        issuer=_resolve_issuer(),
        options=opts,
        leeway=_resolve_leeway_seconds(),
    )
