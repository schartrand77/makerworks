from typing import Literal

from pydantic import BaseModel, Field


class SystemStatus(BaseModel):
    status: Literal["ok"] = Field(
        ..., example="ok", description="Status of the system health check"
    )
    db_connected: bool = Field(
        ..., example=True, description="Indicates if the database is connected"
    )
    uptime_seconds: float = Field(
        ..., example=1234.56, description="Time in seconds since API started"
    )
    host: str = Field(
        ..., example="a1b2c3d4e5", description="Hostname of the server container"
    )
    timestamp: str = Field(
        ...,
        example="2025-06-17T15:40:00Z",
        description="UTC timestamp of the status check",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "ok",
                "db_connected": True,
                "uptime_seconds": 1234.56,
                "host": "a1b2c3d4e5",
                "timestamp": "2025-06-17T15:40:00Z",
            }
        }
    }
