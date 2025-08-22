# app/dependencies.py

from __future__ import annotations

import os
from typing import Any, Optional, Set, Tuple
from uuid import UUID, uuid4

# NOTE: stripe is imported lazily in create_checkout_session() so missing package doesn't break boot
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.database import get_async_db
from app.models.models import User, Filament  # Variant is optional; helpers below avoid ORM dependency
from app.schemas.checkout import CheckoutRequest
from app.services.token_service import decode_token

__all__ = [
    # auth
    "get_current_user",
    "get_current_admin",
    "admin_required",
    "optional_user",
    # checkout
    "create_checkout_session",
    # barcode helpers
    "parse_barcode_fields",
    "find_filament_by_barcode",
    "attach_barcode_to_filament",
    "detach_barcode_from_filament",
    "attach_barcode_to_variant",
    "find_variant_id_by_barcode",
]

# ──────────────────────────────────────────────────────────────────────────────
# Small utils
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
    # Strict Bearer parser
    if not isinstance(authorization, str):
        return None
    s = authorization.strip()
    if not s:
        return None
    parts = s.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return None

def _extract_any_token(authorization: Optional[str]) -> Optional[str]:
    """
    Accepts either 'Bearer <jwt>' or a raw JWT as the Authorization header.
    Helpful behind some proxies or quick local hacks.
    """
    tok = _extract_bearer_token(authorization)
    if tok:
        return tok
    if isinstance(authorization, str):
        raw = authorization.strip()
        # very light heuristic for JWT-ish strings (has at least two dots)
        if raw and " " not in raw and raw.count(".") >= 2:
            return raw
    return None

def _extract_token_from_cookies(request: Request) -> Optional[str]:
    # Accept a variety of cookie names; support either raw token or "Bearer …"
    for name in (
        "Authorization", "authorization",
        "access_token", "access-token",
        "token", "jwt", "session_token",
        "id_token",
    ):
        raw = request.cookies.get(name)
        if not raw:
            continue
        tok = _extract_bearer_token(raw) or (raw.strip() if isinstance(raw, str) else None)
        if tok:
            return tok
    return None

async def _load_user_by_id(db: AsyncSession, uid: Any) -> Optional[User]:
    try:
        result = await db.execute(select(User).where(User.id == uid))
        return result.scalar_one_or_none()
    except Exception:
        return None

def _norm_str(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None

# ──────────────────────────────────────────────────────────────────────────────
# Current user dependency
# - Accepts Authorization header OR cookies OR session.user_id (if present)
# - Returns 401/403 with clear messages
# ──────────────────────────────────────────────────────────────────────────────
async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_forwarded_authorization: Optional[str] = Header(None, alias="X-Forwarded-Authorization"),
    db: AsyncSession = Depends(get_async_db),
) -> User:
    """
    Resolve the current user via:
      1) Authorization: Bearer <JWT> (or X-Forwarded-Authorization) OR raw JWT in Authorization
      2) cookies: access_token/token/jwt/Authorization
      3) request.session['user_id'] (if SessionMiddleware set it)
      4) (dev) X-User-Id header with a raw UUID
    """
    # 1) Authorization header
    token = _extract_any_token(authorization) or _extract_any_token(x_forwarded_authorization)

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
                    user = await _load_user_by_id(db, uid)
        except Exception:
            user = None  # never crash auth on session lookup

    # 4) Dev override header (useful locally; remove if you dislike it)
    if not token and not user:
        dev_uid = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
        if dev_uid:
            user = await _load_user_by_id(db, dev_uid)

    # If we have a token, decode to user
    if token and not user:
        try:
            payload = decode_token(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = payload.get("sub") or payload.get("user_id") or payload.get("uid")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        user = await _load_user_by_id(db, user_id)

    if user is None:
        # Distinguish unauthenticated vs bad header format
        if authorization is not None and _extract_any_token(authorization) is None and authorization != "":
            raise HTTPException(status_code=401, detail="Invalid Authorization header")
        raise HTTPException(status_code=401, detail="Not authenticated")

    if getattr(user, "is_active", True) is False:
        raise HTTPException(status_code=403, detail="User disabled")

    return user


# ──────────────────────────────────────────────────────────────────────────────
# Optional (unauthenticated allowed) user dependency
# ──────────────────────────────────────────────────────────────────────────────
async def optional_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_forwarded_authorization: Optional[str] = Header(None, alias="X-Forwarded-Authorization"),
    db: AsyncSession = Depends(get_async_db),
) -> Optional[User]:
    try:
        # Try the same resolution as get_current_user, but never raise 401
        token = _extract_any_token(authorization) or _extract_any_token(x_forwarded_authorization)
        if not token:
            token = _extract_token_from_cookies(request)

        # session
        if not token:
            sess = getattr(request, "session", None)
            if isinstance(sess, dict):
                uid = sess.get("user_id")
                if uid:
                    u = await _load_user_by_id(db, uid)
                    if u and getattr(u, "is_active", True):
                        return u

        # dev header
        if not token:
            dev_uid = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
            if dev_uid:
                u = await _load_user_by_id(db, dev_uid)
                if u and getattr(u, "is_active", True):
                    return u

        if token:
            try:
                payload = decode_token(token)
                user_id = payload.get("sub") or payload.get("user_id") or payload.get("uid")
                if user_id:
                    u = await _load_user_by_id(db, user_id)
                    if u and getattr(u, "is_active", True):
                        return u
            except Exception:
                return None
        return None
    except Exception:
        # never crash a public endpoint because of auth parsing
        return None


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
# Stripe checkout session builder (lazy import; clearer errors)
# ──────────────────────────────────────────────────────────────────────────────
async def create_checkout_session(
    data: CheckoutRequest,
    user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout session from request data and user info."""
    # Lazy import so stripe isn’t a hard runtime dependency unless you use it
    try:
        import stripe  # type: ignore
    except Exception:
        raise HTTPException(status_code=503, detail="Stripe SDK not installed")

    # tolerate different setting names / envs
    stripe_key = (
        getattr(settings, "STRIPE_SECRET_KEY", None)
        or getattr(settings, "stripe_secret_key", None)
        or os.getenv("STRIPE_SECRET_KEY")
    )
    domain = (
        getattr(settings, "DOMAIN", None)
        or getattr(settings, "domain", None)
        or os.getenv("DOMAIN")
        or "http://localhost:5173"
    )

    if not stripe_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    stripe.api_key = stripe_key

    # normalize & validate amount
    try:
        unit_amount_cents = int(round(float(data.total_cost) * 100))
        if unit_amount_cents < 0:
            raise ValueError("total_cost must be non-negative")
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid total_cost")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": unit_amount_cents,
                        "product_data": {"name": data.description or "3D Print"},
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            customer_email=getattr(user, "email", None),
            success_url=f"{domain.rstrip('/')}/success",
            cancel_url=f"{domain.rstrip('/')}/cancel",
        )
        return {"checkout_url": session.url}
    except stripe.error.CardError as e:  # type: ignore[attr-defined]
        # customer-facing error
        raise HTTPException(status_code=402, detail=getattr(e, "user_message", None) or str(e)) from e
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        # configuration/network/etc
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception:
        # keep generic for safety
        raise HTTPException(status_code=500, detail="Internal server error")


# ──────────────────────────────────────────────────────────────────────────────
# Barcode helpers (attach/detach/find) — work even if ORM model is missing
# ──────────────────────────────────────────────────────────────────────────────

def parse_barcode_fields(data: Any) -> Tuple[Optional[str], Optional[str], bool]:
    """
    Pull out (code, symbology, is_primary) from an arbitrary Pydantic model or dict.
    Accepts: barcode | code, symbology | sym, is_primary_barcode | isPrimary | primary
    """
    get = (lambda k: getattr(data, k, None)) if not isinstance(data, dict) else data.get
    code = _norm_str(get("barcode")) or _norm_str(get("code"))
    sym = _norm_str(get("symbology")) or _norm_str(get("sym"))
    # default primary True on creation, False otherwise is reasonable — here default True
    is_primary_raw = (
        get("is_primary_barcode")
        or get("isPrimary")
        or get("primary")
        or get("is_primary")
    )
    is_primary = bool(is_primary_raw) if is_primary_raw is not None else True
    return code, sym, is_primary


async def find_filament_by_barcode(db: AsyncSession, code: str) -> Optional[Filament]:
    """
    Find and return a Filament by barcode code. Returns None if not found or detached.
    """
    code = _norm_str(code) or ""
    if not code:
        return None
    res = await db.execute(
        text("SELECT filament_id FROM public.barcodes WHERE code = :code LIMIT 1"),
        {"code": code},
    )
    fid = res.scalar_one_or_none()
    if not fid:
        return None
    try:
        return await db.get(Filament, UUID(str(fid)))
    except Exception:
        return None


async def attach_barcode_to_filament(
    db: AsyncSession,
    filament_id: UUID,
    code: str,
    symbology: Optional[str] = None,
    *,
    is_primary: bool = True,
    semantic_type: str = "consumer",
) -> dict:
    """
    Attach (or reattach) a barcode to a filament.
    - Ensures at most one primary barcode per filament (by clearing others if needed).
    - Upserts by code; if the code exists and is unbound, it will be bound to this filament.
    - If the code exists bound to another filament, we rebind only if currently unbound; otherwise 409.
    Returns a small dict describing the outcome.
    """
    code = _norm_str(code) or ""
    if not code:
        raise HTTPException(status_code=422, detail="barcode code required")

    # Clear existing primary for this filament if we're setting a new primary
    if is_primary:
        await db.execute(
            text(
                "UPDATE public.barcodes SET is_primary = false "
                "WHERE filament_id = :fid AND is_primary IS TRUE"
            ),
            {"fid": str(filament_id)},
        )

    # Try a friendly upsert:
    # - If code doesn't exist: insert with our filament_id
    # - If code exists with NULL filament_id: claim it by setting filament_id
    # - If code exists with another filament_id: leave as-is (we'll check and error)
    await db.execute(
        text(
            """
            INSERT INTO public.barcodes (id, code, symbology, type, is_primary, filament_id, created_at)
            VALUES (:id, :code, :symbology, :type, :is_primary, :fid, now())
            ON CONFLICT (code) DO UPDATE
              SET filament_id = COALESCE(public.barcodes.filament_id, EXCLUDED.filament_id),
                  symbology   = COALESCE(EXCLUDED.symbology, public.barcodes.symbology),
                  type        = COALESCE(EXCLUDED.type, public.barcodes.type),
                  is_primary  = CASE
                                  WHEN EXCLUDED.is_primary IS TRUE THEN TRUE
                                  ELSE public.barcodes.is_primary
                                END
            """
        ),
        {
            "id": str(uuid4()),
            "code": code,
            "symbology": symbology,
            "type": semantic_type,
            "is_primary": bool(is_primary),
            "fid": str(filament_id),
        },
    )

    # Verify ownership; if still bound to someone else, report conflict
    check = await db.execute(
        text("SELECT filament_id FROM public.barcodes WHERE code = :code"),
        {"code": code},
    )
    owner = check.scalar_one_or_none()
    if owner and str(owner) != str(filament_id):
        await db.rollback()
        raise HTTPException(status_code=409, detail="barcode_in_use")

    await db.commit()
    return {"code": code, "filament_id": str(filament_id), "is_primary": bool(is_primary)}


async def detach_barcode_from_filament(
    db: AsyncSession,
    code: str,
    *,
    delete_if_unbound: bool = True,
) -> dict:
    """
    Detach a barcode from its filament (sets filament_id = NULL).
    Optionally deletes the row if it becomes fully unbound (no filament_id and no variant_id).
    """
    code = _norm_str(code) or ""
    if not code:
        raise HTTPException(status_code=422, detail="barcode code required")

    # Detach
    res = await db.execute(
        text(
            "UPDATE public.barcodes SET filament_id = NULL, is_primary = false "
            "WHERE code = :code RETURNING filament_id"
        ),
        {"code": code},
    )
    # If code doesn't exist, no-op
    prior_owner = res.scalar_one_or_none()

    # Optionally delete if now fully unbound
    if delete_if_unbound:
        await db.execute(
            text(
                "DELETE FROM public.barcodes "
                "WHERE code = :code AND filament_id IS NULL AND (variant_id IS NULL OR variant_id = NULL)"
            ),
            {"code": code},
        )

    await db.commit()
    return {"code": code, "detached": True, "previous_filament_id": str(prior_owner) if prior_owner else None}


# Variant helpers are optional but handy if/when you barcode product variants.

async def attach_barcode_to_variant(
    db: AsyncSession,
    variant_id: UUID,
    code: str,
    symbology: Optional[str] = None,
    *,
    is_primary: bool = True,
    semantic_type: str = "consumer",
) -> dict:
    """
    Attach (or reattach) a barcode to a product variant.
    Mirrors the filament helper but targets variant_id.
    """
    code = _norm_str(code) or ""
    if not code:
        raise HTTPException(status_code=422, detail="barcode code required")

    if is_primary:
        await db.execute(
            text(
                "UPDATE public.barcodes SET is_primary = false "
                "WHERE variant_id = :vid AND is_primary IS TRUE"
            ),
            {"vid": str(variant_id)},
        )

    await db.execute(
        text(
            """
            INSERT INTO public.barcodes (id, code, symbology, type, is_primary, variant_id, created_at)
            VALUES (:id, :code, :symbology, :type, :is_primary, :vid, now())
            ON CONFLICT (code) DO UPDATE
              SET variant_id = COALESCE(public.barcodes.variant_id, EXCLUDED.variant_id),
                  symbology  = COALESCE(EXCLUDED.symbology, public.barcodes.symbology),
                  type       = COALESCE(EXCLUDED.type, public.barcodes.type),
                  is_primary = CASE
                                 WHEN EXCLUDED.is_primary IS TRUE THEN TRUE
                                 ELSE public.barcodes.is_primary
                               END
            """
        ),
        {
            "id": str(uuid4()),
            "code": code,
            "symbology": symbology,
            "type": semantic_type,
            "is_primary": bool(is_primary),
            "vid": str(variant_id),
        },
    )

    check = await db.execute(
        text("SELECT variant_id FROM public.barcodes WHERE code = :code"),
        {"code": code},
    )
    owner = check.scalar_one_or_none()
    if owner and str(owner) != str(variant_id):
        await db.rollback()
        raise HTTPException(status_code=409, detail="barcode_in_use")

    await db.commit()
    return {"code": code, "variant_id": str(variant_id), "is_primary": bool(is_primary)}


async def find_variant_id_by_barcode(db: AsyncSession, code: str) -> Optional[UUID]:
    """
    Return product_variants.id for a given barcode code, or None.
    (Avoids importing a Variant ORM model.)
    """
    code = _norm_str(code) or ""
    if not code:
        return None
    res = await db.execute(
        text("SELECT variant_id FROM public.barcodes WHERE code = :code LIMIT 1"),
        {"code": code},
    )
    vid = res.scalar_one_or_none()
    try:
        return UUID(str(vid)) if vid else None
    except Exception:
        return None
