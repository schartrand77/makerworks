# app/routes/auth.py
from __future__ import annotations

import json
import logging
import os
import traceback
from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.models import User
from app.schemas.auth import UserCreate, UserOut, UserSignIn  # UserOut kept for compatibility/import side effects
from app.services.auth_service import authenticate_user, create_user
from app.services.cache.user_cache import cache_user_profile
from app.services.session_backend import create_session, destroy_session
from app.utils.filesystem import ensure_user_model_thumbnails_for_user

router = APIRouter()
log = logging.getLogger("uvicorn.error")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _absolute_url(request: Request, maybe_path: Optional[str]) -> Optional[str]:
    if not maybe_path:
        return maybe_path
    s = str(maybe_path)
    if s.startswith(("http://", "https://")):
        return s
    return str(request.base_url).rstrip("/") + s


def _serialize_user(user: User, request: Request) -> dict:
    """Manual serializer so we don't rely on Pydantic .from_orm (v2 gotcha)."""
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "name": getattr(user, "name", None),
        "is_verified": bool(getattr(user, "is_verified", False)),
        "is_active": bool(getattr(user, "is_active", True)),
        "created_at": (
            user.created_at if isinstance(user.created_at, datetime)
            else datetime.now(timezone.utc)
        ),
        "avatar_url": _absolute_url(request, getattr(user, "avatar_url", None)),
    }


async def _email_or_username_exists(db: AsyncSession, email: str, username: str) -> Tuple[bool, bool]:
    q = select(User.email, User.username).where((User.email == email) | (User.username == username))
    rows = (await db.execute(q)).all()
    email_taken = any(r[0] == email for r in rows)
    user_taken = any(r[1] == username for r in rows)
    return email_taken, user_taken


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/signup")
async def signup(
    payload: UserCreate,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new user. Returns 409 for duplicate email/username.
    In development (ENV=development), includes exception details in JSON to make debugging sane.
    """
    dev = (os.getenv("ENV", "development").lower() == "development")

    try:
        # ── Pre-check duplicates (friendly 409s instead of 500s) ─────────────
        email = payload.email.lower()
        email_taken, user_taken = await _email_or_username_exists(db, email, payload.username)
        if email_taken and user_taken:
            raise _conflict("Email and username already in use.")
        if email_taken:
            raise _conflict("Email already in use.")
        if user_taken:
            raise _conflict("Username already in use.")

        # ── Create via service (hashing/validation inside) ───────────────────
        try:
            user = await create_user(db=db, user_in=payload)
        except IntegrityError as ie:
            msg = str(ie.orig).lower()
            if "email" in msg and "unique" in msg:
                raise _conflict("Email already in use.")
            if "username" in msg and "unique" in msg:
                raise _conflict("Username already in use.")
            raise _conflict("Account conflicts with existing user.")
        except HTTPException:
            raise

        # ── Normalize timestamps (timestamptz) ───────────────────────────────
        now = datetime.now(timezone.utc)
        user.created_at = user.created_at or now
        user.last_login = None

        # ── Commit ───────────────────────────────────────────────────────────
        try:
            db.add(user)
            await db.commit()
            await db.refresh(user)
        except IntegrityError as ie:
            await db.rollback()
            msg = str(ie.orig).lower()
            if "email" in msg and "unique" in msg:
                raise _conflict("Email already in use.")
            if "username" in msg and "unique" in msg:
                raise _conflict("Username already in use.")
            raise _conflict("Account conflicts with existing user.")

        # ── Best-effort FS/cache/session/token ───────────────────────────────
        try:
            ensure_user_model_thumbnails_for_user(str(user.id))
        except Exception as e:
            log.error("[AUTH] Thumbnail sync (signup) failed: %s", e)

        user_payload = _serialize_user(user, request)

        try:
            # If your cache expects a Pydantic model, feed it the dict instead.
            await cache_user_profile(user_payload)  # type: ignore[arg-type]
        except Exception as e:
            log.warning("[Signup] cache_user_profile failed: %s", e)

        access_token = create_access_token(
            str(user.id), extra={"email": user.email, "role": user.role}
        )
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            samesite="lax",
            secure=False,
            max_age=60 * 60,
            path="/",
        )

        try:
            session_token = await create_session(user.id)
            response.set_cookie(
                key="session",
                value=session_token,
                httponly=True,
                samesite="lax",
                secure=False,
                max_age=60 * 60 * 24 * 7,
                path="/",
            )
        except Exception as e:
            log.warning("[Signup] create_session failed: %s", e)

        return {"user": user_payload}

    except HTTPException as http_ex:
        log.warning("[Signup] %s", http_ex.detail)
        raise

    except Exception as e:
        tb = traceback.format_exc()
        log.error("[Signup] Unhandled error: %s\n%s", e, tb)
        if dev:
            trimmed = tb.splitlines()[-20:]
            return Response(
                status_code=500,
                media_type="application/json",
                content=json.dumps({
                    "detail": "Internal server error",
                    "debug": {"error": str(e), "where": "auth.signup", "trace": trimmed},
                }),
            )
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/signin")
async def signin(
    payload: UserSignIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_user(db, payload.email_or_username, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    now = datetime.now(timezone.utc)
    user.last_login = now
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except Exception as e:
        await db.rollback()
        log.error("[Signin] commit failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")

    # Ensure thumbnails are synced for this user (best-effort)
    try:
        ensure_user_model_thumbnails_for_user(str(user.id))
    except Exception as e:
        log.error(f"[AUTH] Thumbnail sync (signin) failed: {e}")

    user_payload = _serialize_user(user, request)
    try:
        await cache_user_profile(user_payload)  # type: ignore[arg-type]
    except Exception as e:
        log.warning("[Signin] cache_user_profile failed: %s", e)

    access_token = create_access_token(
        str(user.id), extra={"email": user.email, "role": user.role}
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60,
        path="/",
    )

    try:
        session_token = await create_session(user.id)
        response.set_cookie(
            key="session",
            value=session_token,
            httponly=True,
            samesite="lax",
            secure=False,
            max_age=60 * 60 * 24 * 7,
            path="/",
        )
    except Exception as e:
        log.warning("[Signin] create_session failed: %s", e)

    return {"user": user_payload}


@router.get("/me")
async def me(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's profile."""
    try:
        ensure_user_model_thumbnails_for_user(str(current_user.id))
    except Exception as e:
        log.error(f"[AUTH] Thumbnail sync (/me) failed: {e}")

    return _serialize_user(current_user, request)


@router.post("/signout")
async def signout(
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """Sign the current user out and clear cookies."""
    try:
        await destroy_session(current_user.id)
    except Exception:
        pass
    response.delete_cookie(key="session", path="/")
    response.delete_cookie(key="access_token", path="/")
    return {"status": "ok", "message": "Signed out"}
