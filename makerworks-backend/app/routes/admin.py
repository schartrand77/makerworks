# app/routes/admin.py
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

# Align with your current project structure
from app.db.database import get_async_db
from app.dependencies.auth import get_current_user
from app.models import User, ModelMetadata  # adjust if your models live elsewhere
from app.services.auth_service import log_action

logger = logging.getLogger(__name__)
router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# helpers (NO Pydantic validation; build permissive dicts)
# ──────────────────────────────────────────────────────────────────────────────
def _row_user(u: Any) -> Dict[str, Any]:
    def g(attr: str, default=None):
        return getattr(u, attr, default)
    return {
        "id": str(g("id", "")),
        "email": g("email"),
        "username": g("username"),
        "name": g("name"),
        "avatar_url": g("avatar_url") or None,   # empty string → None
        "language": g("language"),
        "theme": g("theme"),
        "role": g("role"),
        "is_verified": bool(g("is_verified", False)) if g("is_verified") is not None else None,
        "is_active": bool(g("is_active", True)) if g("is_active") is not None else None,
        "created_at": g("created_at"),
        "last_login": g("last_login"),
    }

def _row_upload(m: Any) -> Dict[str, Any]:
    def g(attr: str, default=None):
        return getattr(m, attr, default)
    return {
        "id": str(g("id", "")),
        "user_id": str(g("user_id", "")) if hasattr(m, "user_id") else None,
        "name": g("name"),
        "description": g("description"),
        "filename": g("filename") or g("file_name"),
        "filepath": g("filepath") or g("path"),
        "size": g("size"),
        "created_at": g("created_at") or g("uploaded_at"),
    }

def _q_int(req: Request, name: str, default: int) -> int:
    raw = req.query_params.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        v = int(str(raw))
        return max(0, v)
    except Exception:
        return default

def _is_admin(user: User) -> bool:
    try:
        return (user.role or "").lower() == "admin"
    except Exception:
        return False

async def _exec(db: AsyncSession, stmt):
    return await db.execute(stmt)


class LogRequest(BaseModel):
    action: str
    details: Optional[str] = None


@router.post("/logs", summary="Log Admin Action", status_code=status.HTTP_201_CREATED)
async def create_log(
    payload: LogRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    await log_action(
        db=db,
        user_id=str(current_user.id),
        action=payload.action,
        details=payload.details,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return {"status": "ok"}

# ──────────────────────────────────────────────────────────────────────────────
# GET /api/v1/admin/me
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/me", summary="Admin Me", status_code=status.HTTP_200_OK)
async def admin_me(current_user: User = Depends(get_current_user)):
    if not _is_admin(current_user):
        logger.warning("⛔ Non-admin tried /admin/me: %s", getattr(current_user, "id", "?"))
        raise HTTPException(status_code=403, detail="Admin access required")
    return _row_user(current_user)

# ──────────────────────────────────────────────────────────────────────────────
# GET /api/v1/admin/users  (permissive; no Query[...] validators, no response_model)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/users", summary="List Users", status_code=status.HTTP_200_OK)
async def list_users(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    if not _is_admin(current_user):
        logger.warning("⛔ Non-admin tried to list users: %s", getattr(current_user, "id", "?"))
        raise HTTPException(status_code=403, detail="Admin access required")

    # Accept either page/per_page OR offset/limit; all optional
    page = _q_int(request, "page", 0)
    per_page = _q_int(request, "per_page", 0)
    if page > 0 or per_page > 0:
        p = page or 1
        pp = per_page or 1000
        offset = (p - 1) * pp
        limit = pp
    else:
        offset = _q_int(request, "offset", 0)
        limit = _q_int(request, "limit", 1000)

    stmt = select(User)
    if hasattr(User, "created_at"):
        stmt = stmt.order_by(User.created_at.desc())
    elif hasattr(User, "username"):
        stmt = stmt.order_by(User.username.asc())

    if limit:
        stmt = stmt.offset(offset).limit(limit)

    res = await _exec(db, stmt)
    rows = res.scalars().all()
    # 🚫 No model_validate here — just map to safe dicts
    return [_row_user(u) for u in rows]

# trailing-slash alias
@router.get("/users/", include_in_schema=False)
async def list_users_slash(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    return await list_users(request=request, current_user=current_user, db=db)

# ──────────────────────────────────────────────────────────────────────────────
# POST /api/v1/admin/users/{user_id}/promote
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/users/{user_id}/promote", summary="Promote User", status_code=status.HTTP_200_OK)
async def promote_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    res = await _exec(db, select(User).where(User.id == user_id))
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if hasattr(target, "role"):
        target.role = "admin"
    if hasattr(target, "updated_at"):
        target.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(target)
    return _row_user(target)

# ──────────────────────────────────────────────────────────────────────────────
# POST /api/v1/admin/users/{user_id}/demote
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/users/{user_id}/demote", summary="Demote User", status_code=status.HTTP_200_OK)
async def demote_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    res = await _exec(db, select(User).where(User.id == user_id))
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if hasattr(target, "role"):
        target.role = "user"
    if hasattr(target, "updated_at"):
        target.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(target)
    return _row_user(target)

# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/v1/admin/users/{user_id}  (soft delete when possible)
# ──────────────────────────────────────────────────────────────────────────────
@router.delete("/users/{user_id}", summary="Delete User", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    res = await _exec(db, select(User).where(User.id == user_id))
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if hasattr(target, "is_active"):
        target.is_active = False
        if hasattr(target, "updated_at"):
            target.updated_at = datetime.utcnow()
        await db.commit()
        return {"status": "ok", "message": "Soft-deleted", "id": str(user_id)}

    await db.delete(target)
    await db.commit()
    return {"status": "ok", "message": "Deleted", "id": str(user_id)}

# ──────────────────────────────────────────────────────────────────────────────
# GET /api/v1/admin/users/{user_id}/uploads  (text-only list, no images)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/users/{user_id}/uploads", summary="User Uploads", status_code=status.HTTP_200_OK)
async def user_uploads(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    if ModelMetadata is None:
        return []

    # try common user foreign-key columns
    filters = []
    if hasattr(ModelMetadata, "user_id"):
        filters.append(ModelMetadata.user_id == str(user_id))
    if hasattr(ModelMetadata, "owner_id"):
        filters.append(ModelMetadata.owner_id == str(user_id))
    if hasattr(ModelMetadata, "uploaded_by"):
        filters.append(ModelMetadata.uploaded_by == str(user_id))
    if not filters:
        return []

    stmt = select(ModelMetadata).where(*filters)
    if hasattr(ModelMetadata, "uploaded_at"):
        stmt = stmt.order_by(ModelMetadata.uploaded_at.desc())
    elif hasattr(ModelMetadata, "created_at"):
        stmt = stmt.order_by(ModelMetadata.created_at.desc())

    res = await _exec(db, stmt)
    rows = res.scalars().all()
    return [_row_upload(m) for m in rows]
