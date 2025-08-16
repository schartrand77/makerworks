from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, ConfigDict, Field, HttpUrl, computed_field


class UserOut(BaseModel):
    id: UUID
    username: str
    email: EmailStr

    # mirrors columns on User
    role: Optional[str] = "user"
    is_verified: Optional[bool] = True
    is_active: Optional[bool] = True

    # extras your DB may not have; safe defaults
    banned: Optional[bool] = False
    groups: Optional[List[str]] = []

    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    @computed_field  # convenience for clients
    def is_admin(self) -> bool:
        role = (self.role or "").strip().lower()
        return role == "admin"

    model_config = ConfigDict(from_attributes=True)


class UploadOut(BaseModel):
    id: UUID
    user_id: UUID
    filename: str
    uploaded_at: datetime

    # actual ORM fields on ModelUpload
    file_url: Optional[str] = Field(default=None)
    thumbnail_path: Optional[str] = Field(default=None)

    # optional, present if you store them on ModelUpload
    name: Optional[str] = None
    description: Optional[str] = None

    # optional; not a ModelUpload column (belongs to UploadJob),
    # keep Optional so from_attributes doesn't choke
    status: Optional[str] = None

    @computed_field
    def url(self) -> Optional[str]:
        """Alias for clients expecting `url` instead of `file_url`."""
        return self.file_url

    @computed_field
    def thumbnail_url(self) -> Optional[str]:
        """
        Best-effort public URL:
        - If DB already stores a URL or rooted path, use it.
        - Else fall back to your /thumbnails/{id}.png convention.
        """
        if self.thumbnail_path:
            p = self.thumbnail_path
            if p.startswith("http://") or p.startswith("https://") or p.startswith("/"):
                return p
            # stored as relative FS path -> serve from /uploads
            return f"/uploads/{p}"
        # conventional thumbnail endpoint (your server already returns 200 for this)
        return f"/thumbnails/{self.id}.png"

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class DiscordConfigOut(BaseModel):
    webhook_url: Optional[HttpUrl] = None
    channel_id: Optional[str] = ""
    feed_enabled: bool = True

    model_config = ConfigDict(from_attributes=True)
