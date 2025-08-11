# app/routes/auth.py
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.security import create_access_token
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.models import User
from app.schemas.auth import UserCreate, UserOut, UserSignIn
from app.services.auth_service import authenticate_user, create_user
from app.services.cache.user_cache import cache_user_profile
from app.services.session_backend import create_session, destroy_session  # kept for transition/back-compat
from app.utils.filesystem import ensure_user_model_thumbnails_for_user

import logging

router = APIRouter()
logger = logging.getLogger(__name__)


def serialize_user(user: User, request: Request) -> UserOut:
    user_out = UserOut.from_orm(user)
    if user_out.avatar_url and not str(user_out.avatar_url).startswith("http"):
        user_out.avatar_url = str(request.base_url).rstrip("/") + user_out.avatar_url
    return user_out


@router.post("/signup")
async def signup(
    payload: UserCreate,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # Ensure unique email
    exists = await db.execute(select(User).where(User.email == payload.email))
    if exists.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user (hashes password inside service)
    user = await create_user(db=db, user_in=payload)

    now_utc = datetime.utcnow().replace(tzinfo=None)
    user.created_at = now_utc
    user.last_login = None
    await db.commit()
    await db.refresh(user)

    # FS prep
    try:
        ensure_user_model_thumbnails_for_user(str(user.id))
    except Exception as e:
        logger.error(f"[AUTH] Thumbnail sync (signup) failed: {e}")

    user_out = serialize_user(user, request)
    await cache_user_profile(user_out)

    # Issue JWT (Bearer)
    access_token = create_access_token(str(user.id), extra={"email": user.email, "role": user.role})

    # Optional cookie for browser flows (kept SameSite/flags dev-friendly)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60,
        path="/",
    )

    # Transitional session cookie (can be removed once frontend is fully on JWT)
    try:
        session_token = await create_session(user.id)
        response.set_cookie(
            key="session",
            value=session_token,
            httponly=True,
            samesite="none",
            secure=False,
            max_age=60 * 60 * 24 * 7,
            path="/",
        )
    except Exception:
        session_token = None

    return {
        "access_token": access_token,
        "token": access_token,  # back-compat for old clients expecting "token"
        "token_type": "bearer",
        "user": user_out.model_dump(),
    }


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

    now_utc = datetime.utcnow().replace(tzinfo=None)
    user.last_login = now_utc
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Ensure thumbnails are synced for this user
    try:
        ensure_user_model_thumbnails_for_user(str(user.id))
    except Exception as e:
        logger.error(f"[AUTH] Thumbnail sync (signin) failed: {e}")

    user_out = serialize_user(user, request)
    await cache_user_profile(user_out)

    # Issue JWT (Bearer)
    access_token = create_access_token(str(user.id), extra={"email": user.email, "role": user.role})

    # Optional cookie for browser flows
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60,
        path="/",
    )

    # Transitional session cookie (can be removed once frontend is fully on JWT)
    try:
        session_token = await create_session(user.id)
        response.set_cookie(
            key="session",
            value=session_token,
            httponly=True,
            samesite="none",
            secure=False,
            max_age=60 * 60 * 24 * 7,
            path="/",
        )
    except Exception:
        pass

    return {
        "access_token": access_token,
        "token": access_token,  # back-compat for old clients expecting "token"
        "token_type": "bearer",
        "user": user_out.model_dump(),
    }


@router.get("/me", response_model=UserOut)
async def me(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        ensure_user_model_thumbnails_for_user(str(current_user.id))
    except Exception as e:
        logger.error(f"[AUTH] Thumbnail sync (/me) failed: {e}")

    return serialize_user(current_user, request)


@router.post("/signout")
async def signout(
    response: Response,
    current_user: User = Depends(get_current_user),
):
    # Best-effort: clear transitional server session and cookies
    try:
        await destroy_session(current_user.id)
    except Exception:
        pass
    response.delete_cookie(key="session", path="/")
    response.delete_cookie(key="access_token", path="/")
    return {"status": "ok", "message": "Signed out"}
