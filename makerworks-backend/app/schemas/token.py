# app/schemas/token.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Literal, List
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ─────────────────────────────────────────────────────────────
# OAuth2 / JWT Token Response Schemas
# ─────────────────────────────────────────────────────────────

class Token(BaseModel):
    """
    Access token response. Back-compat with existing clients, but includes
    optional fields needed for Redis-backed sessions.
    """
    access_token: str = Field(..., example="eyJhbGciOiJIUzI1...")
    token_type: Literal["bearer"] = Field("bearer", example="bearer")
    scope: Optional[str] = Field(None, example="openid profile email")

    # New (optional) fields for sessionful flows
    session_id: Optional[UUID] = Field(None, description="Server session id (sid claim)")
    expires_in: Optional[int] = Field(
        None, description="Seconds until access token expiry (exp - now)"
    )
    refresh_token: Optional[str] = Field(
        None, description="Refresh token if using refresh flow"
    )

    model_config = {"from_attributes": True}


class RefreshToken(BaseModel):
    """
    Optional separate schema when you rotate refresh tokens.
    """
    refresh_token: str = Field(..., example="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")
    token_type: Literal["bearer"] = Field("bearer", example="bearer")
    session_id: Optional[UUID] = Field(None)
    expires_in: Optional[int] = Field(
        None, description="Seconds until refresh token expiry"
    )

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# Session object for Redis
# ─────────────────────────────────────────────────────────────

class SessionInfo(BaseModel):
    """
    Minimal session record to store in Redis under key: session:{sid}
    Use TTL on the key to auto-expire. Example payload:

    {
      "sid": "...", "sub": "...", "email": "...",
      "issued_at": "...", "expires_at": "...",
      "revoked": false, "client": "ua/ip label"
    }
    """
    sid: UUID = Field(..., description="Session id (also in JWT 'sid')")
    sub: UUID = Field(..., description="User id (UUID)")
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    groups: List[str] = Field(default_factory=list)
    role: Optional[str] = Field(None, example="admin")

    issued_at: datetime = Field(..., description="UTC datetime session issued")
    expires_at: datetime = Field(..., description="UTC datetime session expires")
    revoked: bool = Field(False, description="True if server revoked the session")

    client: Optional[str] = Field(
        None, description="Optional device/UA/IP descriptor"
    )

    @property
    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# Optional Authenticated User Token Data (partial claims)
# ─────────────────────────────────────────────────────────────

class TokenData(BaseModel):
    """Lightweight claims used by dependencies downstream."""
    sub: Optional[UUID] = Field(None, example="891108d0-45f0-4a73-a733-c7b229115fc0")
    email: Optional[EmailStr] = Field(None, example="user@example.com")
    name: Optional[str] = Field(None, example="John Doe")
    preferred_username: Optional[str] = Field(None, example="johnd")
    groups: List[str] = Field(default_factory=list, example=["admin", "user"])
    role: Optional[str] = Field(None, example="admin")
    picture: Optional[str] = Field(None, example="https://cdn.example.com/avatar.png")

    # New: typical JWT/federation fields you’ll want in code
    iss: Optional[str] = Field(None, example="makerworks")
    aud: Optional[str] = Field(None, example="makerworks-web")
    jti: Optional[str] = Field(None, description="JWT id for revocation lists")
    sid: Optional[UUID] = Field(None, description="Session id")
    scope: Optional[str] = Field(None, example="openid profile email")

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
# Full Decoded JWT Payload
# ─────────────────────────────────────────────────────────────

class TokenPayload(BaseModel):
    """
    Full payload for decoded JWT access tokens.
    Include iss/aud/jti/sid to support Redis revocation and audience checks.
    """
    sub: UUID = Field(..., example="891108d0-45f0-4a73-a733-c7b229115fc0")
    email: EmailStr = Field(..., example="user@example.com")
    name: Optional[str] = Field(None, example="John Doe")
    preferred_username: Optional[str] = Field(None, example="johnd")
    groups: List[str] = Field(default_factory=list, example=["admin", "user"])
    role: Optional[str] = Field(None, example="admin")
    picture: Optional[str] = Field(None, example="https://cdn.example.com/avatar.png")

    # Standard JWT fields
    iss: str = Field(..., example="makerworks")
    aud: str = Field(..., example="makerworks-web")
    jti: str = Field(..., description="JWT id")
    sid: UUID = Field(..., description="Session id")

    exp: int = Field(..., description="Expiration (unix epoch)")
    iat: int = Field(..., description="Issued-at (unix epoch)")
    nbf: Optional[int] = Field(None, description="Not-before (unix epoch)")

    @property
    def is_expired(self) -> bool:
        return datetime.now(timezone.utc).timestamp() > self.exp

    @property
    def expires_in_seconds(self) -> int:
        return int(self.exp - datetime.now(timezone.utc).timestamp())

    model_config = {"from_attributes": True}
