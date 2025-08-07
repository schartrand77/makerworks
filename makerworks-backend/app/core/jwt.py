from datetime import datetime, timedelta
from typing import Optional

import logging
from jose import jwt
from jose.exceptions import JWTError

from app.config.settings import settings

logger = logging.getLogger(__name__)

# JWT configuration
JWT_AUDIENCE: Optional[str] = getattr(settings, "jwt_audience", None)
JWT_ALGORITHM: str = getattr(settings, "jwt_algorithm", "RS256")
PRIVATE_KEY_PATH: str = getattr(settings, "private_key_path", "keys/private.pem")

logger.debug(f"JWT_ALGORITHM: {JWT_ALGORITHM}")
logger.debug(f"PRIVATE_KEY_PATH: {PRIVATE_KEY_PATH}")

PRIVATE_KEY: Optional[bytes] = None

try:
    with open(PRIVATE_KEY_PATH, "rb") as f:
        PRIVATE_KEY = f.read()
        logger.info(f"✅ Private key loaded from {PRIVATE_KEY_PATH}")
except FileNotFoundError:
    logger.error(f"❌ Private key file not found: {PRIVATE_KEY_PATH}")
except Exception as e:
    logger.error(f"❌ Failed to load private key from {PRIVATE_KEY_PATH}: {e}")
    PRIVATE_KEY = None


def create_jwt_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed JWT token.

    Args:
        data (dict): Payload data to include in the token.
        expires_delta (Optional[timedelta]): How long the token is valid for.

    Returns:
        str: Signed JWT token.

    Raises:
        RuntimeError: if the private key could not be loaded or JWT fails to encode.
    """
    if not PRIVATE_KEY:
        raise RuntimeError(
            f"Cannot create JWT: private key was not loaded. Check PRIVATE_KEY_PATH ({PRIVATE_KEY_PATH})."
        )

    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode["exp"] = expire

    if JWT_AUDIENCE:
        to_encode["aud"] = JWT_AUDIENCE

    try:
        encoded_jwt = jwt.encode(to_encode, PRIVATE_KEY, algorithm=JWT_ALGORITHM)
        logger.debug(f"JWT successfully created for payload keys: {list(data.keys())}")
        return encoded_jwt
    except JWTError as e:
        logger.error(f"❌ Failed to encode JWT: {e}")
        raise RuntimeError(f"Failed to encode JWT: {e}") from e
