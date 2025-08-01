# app/schemas/models.py

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, constr, field_validator, ConfigDict
import os
import re
from pathlib import Path
from app.config.settings import settings

# =========================
# Helpers
# =========================

def _normalize_media_url(path: Optional[str]) -> Optional[str]:
    """Normalize paths to be served from /uploads."""
    if not path:
        return path
    path = re.sub(r"\?.*$", "", str(path))
    uploads_root = str(settings.uploads_path)
    if path.startswith(uploads_root):
        rel = Path(path).relative_to(uploads_root).as_posix()
        return f"/uploads/{rel}"
    if path.startswith("/uploads/"):
        return path
    return f"/uploads/{path.lstrip('/')}"

# =========================
# Base Model Schemas
# =========================

class ModelBase(BaseModel):
    name: str = Field(..., max_length=255, description="Name of the model")
    description: Optional[str] = Field(
        None, max_length=1024, description="Optional description of the model"
    )
    is_active: bool = True

class ModelCreate(ModelBase):
    file_url: str = Field(..., description="URL to the uploaded STL/3MF file")
    thumbnail_url: Optional[str] = Field(None, description="Optional thumbnail image URL")
    uploaded_by: Optional[str] = Field(None, description="User ID of the uploader")
    geometry_hash: Optional[constr(pattern=r"^[a-f0-9]{64}$")] = Field(
        None, description="Optional SHA-256 hash of the model geometry"
    )

class ModelUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1024)
    is_active: Optional[bool] = None
    thumbnail_url: Optional[str] = None
    geometry_hash: Optional[constr(pattern=r"^[a-f0-9]{64}$")] = None
    is_duplicate: Optional[bool] = None

class ModelOut(ModelBase):
    id: str = Field(..., description="UUID of the model")
    file_url: str
    thumbnail_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    uploaded_by: Optional[str] = None
    geometry_hash: Optional[str] = None
    is_duplicate: Optional[bool] = None

    @field_validator('thumbnail_url', 'file_url', mode='before')
    @classmethod
    def normalize_urls(cls, v):
        return _normalize_media_url(v)

    model_config = ConfigDict(from_attributes=True)  # ✅ Pydantic v2

# =========================
# Upload Request/Response
# =========================

class ModelUploadRequest(BaseModel):
    name: str = Field(..., max_length=255, description="Name of the uploaded model")
    description: Optional[str] = Field(None, max_length=1024, description="Description of the model")
    file_url: str = Field(..., description="URL to the uploaded file (STL, 3MF, etc.)")
    thumbnail_url: Optional[str] = Field(None, description="URL to the thumbnail image")
    uploaded_by: Optional[str] = Field(None, description="User ID of the uploader")
    geometry_hash: Optional[constr(pattern=r"^[a-f0-9]{64}$")] = Field(
        None, description="SHA-256 hash of the model geometry"
    )

class ModelUploadResponse(BaseModel):
    id: str = Field(..., description="UUID of the model")
    name: str
    file_url: str
    thumbnail_url: Optional[str] = None
    created_at: datetime
    uploaded_by: Optional[str] = None
    geometry_hash: Optional[str] = None
    is_duplicate: Optional[bool] = None

    @field_validator('thumbnail_url', 'file_url', mode='before')
    @classmethod
    def normalize_urls(cls, v):
        return _normalize_media_url(v)

    model_config = ConfigDict(from_attributes=True)

# =========================
# Model Upload Output Schema
# =========================

class ModelUploadOut(BaseModel):
    """
    Used by /upload route to return consistent info for frontend.
    """
    status: str = Field(..., description="Upload status (queued, duplicate, etc.)")
    message: str = Field(..., description="Status message for the frontend")
    model_id: str = Field(..., description="UUID of the uploaded model")
    user_id: str = Field(..., description="UUID of the uploading user")
    filename: str = Field(..., description="Original filename of the uploaded model")
    file_path: str = Field(..., description="Relative URL to the uploaded model")
    thumbnail: Optional[str] = Field(None, description="Relative URL to the thumbnail")
    turntable: Optional[str] = Field(None, description="Relative URL to the turntable video")
    uploaded_at: datetime = Field(..., description="UTC timestamp of upload")
    job_id: Optional[str] = Field(None, description="Celery job ID for preview rendering")

    @field_validator('thumbnail', 'file_path', mode='before')
    @classmethod
    def normalize_urls(cls, v):
        return _normalize_media_url(v)

    model_config = ConfigDict(from_attributes=True)
