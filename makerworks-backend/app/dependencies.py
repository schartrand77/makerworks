# app/dependencies.py

from __future__ import annotations

import stripe
from typing import Any, Optional, Set

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.database import get_async_db
from app.models.models import User
from app.schemas.checkout import CheckoutRequest
from app.services.token_service import decode_token

__all__ = [
    "get_current_user",
    "get_current_admin",
    "admin_required",
    "create_checkout_session",
]


# ──────────────────────────────────────────────────────────────────────────────
# Auth helpers
# ──────────────────────────────────────────────────────────────────────────────

def _roles_lower(val: Any) -> Set[str]:
    if isinstance(val, (list, tuple, set, frozenset)):
        return {str(x).lower() for x in val}
    return set()

def _user_is_admin(u: Any) -> bool:
    if not u:
        return False
    # common flags
    if getattr(u, "is_admin", False):
        return True
    if getattr(u, "is_staff", False):
        return True
    if getattr(u, "is_superuser", False):
        return True
    # single role
    role = getattr(u, "role", None)
    if isinstance(role, str) and role.lower() in {"admin", "superuser", "staff"}:
        return True
    # multiple roles
    if _roles_lower(getattr(u, "roles", None)) & {"admin", "superuser", "staff"}:
        return True
    return False

def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    # Be defensive: only accept strings; anything else is ignored
    if not isinstance(authorization, str):
        return None
    s = authorization.strip()
    if not s:
        return None
    parts = s.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return None

def _extract_token_from_cookies(request: Request) -> Optional[str]:
    # Accept a variety of cookie names; support either raw token or "Bearer …"
    for name in ("Authorization", "authorization", "access_token", "token", "jwt", "session_token"):
        raw = request.cookies.get(name)
        if not raw:
            continue
        tok = _extract_bearer_token(raw) or (raw.strip() if isinstance(raw, str) else None)
        if tok:
            return tok
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Current user dependency
# - Accepts Authorization header OR cookies OR session.user_id (if present)
# - Returns 401/403 with clear messages
# ──────────────────────────────────────────────────────────────────────────────
async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),  # IMPORTANT: str | None, not Header
    db: AsyncSession = Depends(get_async_db),
) -> User:
    """
    Resolve the current user via:
      1) Authorization: Bearer <JWT>
      2) cookies: access_token/token/jwt/Authorization
      3) request.session['user_id'] (if SessionMiddleware set it)
      4) (dev) X-User-Id header with a raw UUID
    """
    # 1) Authorization header (Bearer)
    token = _extract_bearer_token(authorization)

    # 2) Cookie tokens (access_token, token, jwt, Authorization)
    if not token:
        token = _extract_token_from_cookies(request)

    user: Optional[User] = None

    # 3) Session-based user (if your auth layer sets it)
    if not token:
        try:
            sess = getattr(request, "session", None)
            if isinstance(sess, dict):
                uid = sess.get("user_id")
                if uid:
                    result = await db.execute(select(User).where(User.id == uid))
                    user = result.scalar_one_or_none()
        except Exception:
            user = None  # never crash auth on session lookup

    # 4) Dev override header (useful locally; remove if you dislike it)
    if not token and not user:
        dev_uid = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
        if dev_uid:
            result = await db.execute(select(User).where(User.id == dev_uid))
            user = result.scalar_one_or_none()

    # If we have a token, decode to user
    if token and not user:
        try:
            payload = decode_token(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = payload.get("sub") or payload.get("user_id") or payload.get("uid")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if user is None:
        # Distinguish unauthenticated vs bad header format
        if authorization is not None and _extract_bearer_token(authorization) is None and authorization != "":
            raise HTTPException(status_code=401, detail="Invalid Authorization header")
        raise HTTPException(status_code=401, detail="Not authenticated")

    if getattr(user, "is_active", True) is False:
        raise HTTPException(status_code=403, detail="User disabled")

    return user


# ──────────────────────────────────────────────────────────────────────────────
# Admin gate
# ──────────────────────────────────────────────────────────────────────────────
async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not _user_is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user

async def admin_required(user: User = Depends(get_current_user)) -> User:
    if not _user_is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# ──────────────────────────────────────────────────────────────────────────────
# Stripe checkout session builder (unchanged externally; clearer errors)
# ──────────────────────────────────────────────────────────────────────────────
async def create_checkout_session(
    data: CheckoutRequest,
    user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout session from request data and user info."""
    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": int(data.total_cost * 100),  # dollars → cents
                        "product_data": {"name": data.description},
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            customer_email=getattr(user, "email", None),
            success_url=f"{settings.DOMAIN}/success",
            cancel_url=f"{settings.DOMAIN}/cancel",
        )
        return {"checkout_url": session.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
