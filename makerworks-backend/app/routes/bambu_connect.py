import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_async_db
from app.dependencies import get_current_user
from app.schemas.user import UserOut

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/bambu",
    tags=["Bambu Connect"],
)


class X1CCommand(BaseModel):
    ip: str = Field(..., description="IP address of the X1C printer")
    access_token: str = Field(
        ..., description="Local API access token from printer settings"
    )
    command: str = Field(
        ...,
        description="Command to send: status | start_print | pause | stop | unlock | lock",
    )
    payload: dict = Field(
        default_factory=dict,
        description="Optional payload (e.g. file info, parameters)",
    )


def _make_headers(token: str):
    return {
        "Content-Type": "application/json",
        "X-Api-Key": token,
    }


@router.get("/status")
async def x1c_status(
    ip: str,
    access_token: str,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Get current printer status from X1C.
    """
    url = f"http://{ip}/access/printer/status"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=_make_headers(access_token), timeout=5)
        resp.raise_for_status()
        return resp.json()
    except httpx.RequestError as e:
        logger.error(f"X1C status fetch failed: {e}")
        raise HTTPException(
            status_code=502, detail="Could not fetch status from printer."
        ) from e


@router.post("/command")
async def x1c_command(
    cmd: X1CCommand,
    current_user: UserOut = Depends(get_current_user),
    db: Session = Depends(get_async_db),
):
    """
    Send a command to Bambu Lab X1C.
    """
    base_url = f"http://{cmd.ip}/access"

    command_map = {
        "start_print": "/print/start",
        "pause": "/print/pause",
        "stop": "/print/stop",
        "unlock": "/lock/unlock",
        "lock": "/lock/lock",
        "status": "/printer/status",
    }

    if cmd.command not in command_map:
        raise HTTPException(
            status_code=400, detail=f"Unsupported command: {cmd.command}"
        )

    url = f"http://{cmd.ip}/access{command_map[cmd.command]}"

    try:
        logger.info(f"Sending X1C command: {cmd.command} → {url}")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers=_make_headers(cmd.access_token),
                json=cmd.payload,
                timeout=5,
            )
        resp.raise_for_status()
        return {"status": "success", "response": resp.json()}
    except httpx.RequestError as e:
        logger.error(f"X1C command failed: {e}")
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/info")
async def x1c_info(
    ip: str,
    access_token: str,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Get basic printer info (model, firmware, serial, etc).
    """
    url = f"http://{ip}/access/printer/info"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=_make_headers(access_token), timeout=5)
        resp.raise_for_status()
        return resp.json()
    except httpx.RequestError as e:
        logger.error(f"X1C info fetch failed: {e}")
        raise HTTPException(
            status_code=502, detail="Could not fetch printer info."
        ) from e
