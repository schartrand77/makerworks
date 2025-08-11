from __future__ import annotations
import logging
from typing import Any, Dict, Optional
from passlib.context import CryptContext
from app.core.security import (
    create_access_token as _create_access_token,
    decode_token as _decode_token,
)
log = logging.getLogger(__name__)
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string")
    return _pwd.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        return _pwd.verify(plain_password, hashed_password)
    except Exception:
        return False

def issue_jwt(subject: str, extra: Optional[Dict[str, Any]] = None) -> str:
    return _create_access_token(subject, extra=extra)

def decode_jwt(token: str) -> Dict[str, Any]:
    return _decode_token(token)

create_jwt_token = issue_jwt
decode_jwt_token = decode_jwt

__all__ = [
    "hash_password",
    "verify_password",
    "issue_jwt",
    "decode_jwt",
    "create_jwt_token",
    "decode_jwt_token",
]
