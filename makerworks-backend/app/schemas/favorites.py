from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from uuid import UUID

class FavoriteOut(BaseModel):
    id: UUID
    user_id: UUID
    filename: str
    name: Optional[str]
    description: Optional[str]
    file_path: str
    thumbnail_path: str
    uploaded_at: datetime

    # ✅ Metadata fields
    volume: Optional[float] = None
    surface_area: Optional[float] = None
    bbox_x: Optional[float] = None
    bbox_y: Optional[float] = None
    bbox_z: Optional[float] = None
    faces: Optional[int] = None
    vertices: Optional[int] = None
    geometry_hash: Optional[str] = None

    class Config:
        orm_mode = True
