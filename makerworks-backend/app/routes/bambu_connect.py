import os
import asyncio
import inspect
import logging
from typing import Any, Dict, Optional, Callable, AsyncGenerator, Generator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import (
    BaseModel,
    Field,
    ConfigDict,
    AnyHttpUrl,
    field_validator,
    model_validator,
)
from sqlalchemy.orm import Session

from app.db.session import get_async_db
from app.dependencies import get_current_user
from app.schemas.user import UserOut

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/bambu",
    tags=["Bambu Connect"],
)

# ------------------------------------------------------------------------------
# Simple HTTP passthrough helpers (X1C local REST)
# ------------------------------------------------------------------------------

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


def _make_headers(token: str) -> Dict[str, str]:
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
    Get current printer status from X1C (simple HTTP passthrough).
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
    db: Session = Depends(get_async_db),  # kept for parity with other routes
):
    """
    Send a command to Bambu Lab X1C via simple HTTP passthrough.
    """
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
    Get basic printer info (model, firmware, serial, etc) via simple HTTP passthrough.
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

# ------------------------------------------------------------------------------
# Integrated BRIDGE (lifted/adapted from bridge.py)
#   - Multi-printer via env
#   - Uses pybambu BambuClient (LAN MQTT)
#   - Safe degrade if pybambu not installed (returns 501)
# ------------------------------------------------------------------------------

# Try to import pybambu without blowing up the whole app if missing.
try:
    from pybambu import BambuClient  # pybambu 1.0.x
    _PYBAMBU_AVAILABLE = True
except Exception as _e:
    BambuClient = None  # type: ignore
    _PYBAMBU_AVAILABLE = False
    logger.warning("pybambu not available: %s", _e)

def _require_pybambu() -> None:
    if not _PYBAMBU_AVAILABLE:
        raise HTTPException(
            501,
            "pybambu is not installed in this environment. "
            "Install it to use /bambu/bridge endpoints."
        )

# ---- runtime state -----------------------------------------------------------
clients: Dict[str, "BambuClient"] = {}  # name -> live client
last_error: Dict[str, str] = {}         # name -> last connection error message

# ---- env helpers -------------------------------------------------------------
def _pairs(env: str) -> Dict[str, str]:
    """'name@host;other@host2' -> {name: host, ...}"""
    out: Dict[str, str] = {}
    raw = os.getenv(env, "")
    for part in filter(None, raw.split(";")):
        if "@" in part:
            n, h = part.split("@", 1)
            out[n.strip()] = h.strip()
    return out

def _kv(env: str) -> Dict[str, str]:
    """'name=value;other=value2' -> {name: value, ...}"""
    out: Dict[str, str] = {}
    raw = os.getenv(env, "")
    for part in filter(None, raw.split(";")):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out

PRINTERS   = _pairs("BAMBULAB_PRINTERS")    # name -> host
SERIALS    = _kv("BAMBULAB_SERIALS")        # name -> serial
LAN_KEYS   = _kv("BAMBULAB_LAN_KEYS")       # name -> access_code
TYPES      = _kv("BAMBULAB_TYPES")          # name -> model (X1C/P1S/A1...), default X1C

REGION     = os.getenv("BAMBULAB_REGION", "US")
EMAIL      = os.getenv("BAMBULAB_EMAIL", "")
USERNAME   = os.getenv("BAMBULAB_USERNAME", "")
AUTH_TOKEN = os.getenv("BAMBULAB_AUTH_TOKEN", "")
AUTOCONNECT = os.getenv("BAMBULAB_AUTOCONNECT", "0") not in ("", "0", "false", "False", "no", "NO")

def _require_known(name: str):
    if name not in PRINTERS:
        raise HTTPException(404, f"Unknown printer '{name}'")
    if name not in SERIALS:
        raise HTTPException(400, f"Missing serial for '{name}' (set BAMBULAB_SERIALS)")
    if name not in LAN_KEYS:
        raise HTTPException(400, f"Missing access code for '{name}' (set BAMBULAB_LAN_KEYS)")

def _pick(obj: Any, names: tuple[str, ...]) -> Optional[Callable]:
    for n in names:
        fn = getattr(obj, n, None)
        if callable(fn):
            return fn
    return None

# ---- connection core ---------------------------------------------------------
async def _connect(name: str, raise_http: bool = True) -> "BambuClient":
    """Ensure a connected BambuClient; return it or raise HTTP error."""
    _require_pybambu()
    _require_known(name)

    c = clients.get(name)
    if c and getattr(c, "connected", False):
        return c

    host   = PRINTERS[name]
    serial = SERIALS[name]
    access = LAN_KEYS[name]
    dtype  = TYPES.get(name, "X1C")

    try:
        c = BambuClient(
            device_type=dtype,
            serial=serial,
            host=host,
            local_mqtt=True,
            access_code=access,  # pybambu 1.0.x kwarg
            region=REGION,
            email=EMAIL,
            username=USERNAME,
            auth_token=AUTH_TOKEN,
        )
        # Start LAN MQTT (spawns internal threads)
        # Most builds expose connect(callback=...) and a .connected flag.
        c.connect(callback=lambda evt: None)

        # Wait briefly (~5s) for connected flag
        for _ in range(50):
            if getattr(c, "connected", False):
                break
            await asyncio.sleep(0.1)

        if not getattr(c, "connected", False):
            raise RuntimeError("Printer MQTT connected=False after wait")

        clients[name] = c
        last_error.pop(name, None)
        logger.info("connected: %s@%s (%s)", name, host, serial)
        return c

    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        last_error[name] = detail
        logger.warning("connect(%s) failed: %s", name, detail)
        if raise_http:
            raise HTTPException(status_code=502, detail=f"connect failed: {detail}")
        raise

# ---- optional autoconnect on startup -----------------------------------------
@router.on_event("startup")
async def _bridge_startup():
    if not _PYBAMBU_AVAILABLE:
        logger.info("bridge startup: pybambu not installed; bridge endpoints will 501")
        return

    if not AUTOCONNECT:
        logger.info("bridge startup: lazy mode (BAMBULAB_AUTOCONNECT not set)")
        return

    if not PRINTERS:
        logger.info("bridge startup: no PRINTERS configured")
        return

    logger.info("bridge startup: autoconnect enabled")
    async def warm(n: str):
        try:
            await _connect(n, raise_http=False)
        except Exception as e:
            logger.warning("warm(%s) error: %s", n, e)
    await asyncio.gather(*[warm(n) for n in PRINTERS])

# ---- bridge routes (secured) -------------------------------------------------

@router.get("/bridge/healthz")
async def bridge_healthz(current_user: UserOut = Depends(get_current_user)):
    _require_pybambu()
    return {"ok": True, "printers": list(PRINTERS.keys())}

@router.get("/bridge/printers")
async def bridge_list_printers(current_user: UserOut = Depends(get_current_user)):
    _require_pybambu()
    out = []
    for n, host in PRINTERS.items():
        c = clients.get(n)
        out.append({
            "name": n,
            "host": host,
            "serial": SERIALS.get(n),
            "connected": bool(c and getattr(c, "connected", False)),
            "last_error": last_error.get(n),
        })
    return out

@router.post("/bridge/{name}/connect")
async def bridge_connect_now(
    name: str,
    current_user: UserOut = Depends(get_current_user),
):
    c = await _connect(name)
    return {"ok": True, "name": name, "host": getattr(c, "host", None), "serial": SERIALS.get(name)}

@router.get("/bridge/{name}/status")
async def bridge_status(
    name: str,
    current_user: UserOut = Depends(get_current_user),
):
    c = await _connect(name)
    dev = getattr(c, "get_device", lambda: None)()
    data: Dict[str, Any] = {
        "name": name,
        "host": getattr(c, "host", None),
        "serial": SERIALS.get(name),
        "connected": getattr(c, "connected", False),
    }
    # Optional blobs if present in your pybambu build
    try:
        if dev is not None and getattr(dev, "get_version_data", None):
            data["get_version"] = dev.get_version_data
        if dev is not None and getattr(dev, "push_all_data", None):
            data["push_all"] = dev.push_all_data
    except Exception as e:
        data["note"] = f"status extras unavailable: {type(e).__name__}"
    return JSONResponse(data)

# ---- Pydantic v2-safe body for print job ------------------------------------

class BridgePrintJob(BaseModel):
    # Accept ONE of these:
    gcode_url: Optional[AnyHttpUrl] = None
    url_3mf: Optional[AnyHttpUrl] = Field(None, alias="3mf_url")

    # Optional toggles for your workflow
    start: bool = True
    copy_to_sd: bool = False

    # v2 config
    model_config = ConfigDict(
        populate_by_name=True,  # allow using field name when alias exists
        extra="forbid",
    )

    @field_validator("gcode_url", "url_3mf", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        return None if v in (None, "") else v

    @model_validator(mode="after")
    def _exactly_one_url(self):
        # exactly one must be provided
        if bool(self.gcode_url) == bool(self.url_3mf):
            raise ValueError("Provide exactly one of gcode_url or 3mf_url")
        return self

@router.post("/bridge/{name}/print")
async def bridge_start_print(
    name: str,
    job: BridgePrintJob,
    current_user: UserOut = Depends(get_current_user),
):
    c = await _connect(name)
    url = job.gcode_url or job.url_3mf
    assert url is not None  # model validation guarantees it

    fn = _pick(c, ("start_print_from_url", "start_print"))
    if not fn:
        raise HTTPException(501, "pybambu missing print-from-url API")
    try:
        try:
            return fn(url=url)  # preferred kw
        except TypeError:
            return fn(url)      # some builds position-only
    except Exception as e:
        raise HTTPException(502, detail=f"start_print failed: {type(e).__name__}: {e}")

@router.post("/bridge/{name}/pause")
async def bridge_pause(
    name: str,
    current_user: UserOut = Depends(get_current_user),
):
    c = await _connect(name)
    fn = _pick(c, ("pause_print", "pause"))
    if not fn:
        raise HTTPException(501, "pybambu missing pause API")
    try:
        return fn()
    except Exception as e:
        raise HTTPException(502, detail=f"pause failed: {type(e).__name__}: {e}")

@router.post("/bridge/{name}/resume")
async def bridge_resume(
    name: str,
    current_user: UserOut = Depends(get_current_user),
):
    c = await _connect(name)
    fn = _pick(c, ("resume_print", "resume"))
    if not fn:
        raise HTTPException(501, "pybambu missing resume API")
    try:
        return fn()
    except Exception as e:
        raise HTTPException(502, detail=f"resume failed: {type(e).__name__}: {e}")

@router.post("/bridge/{name}/stop")
async def bridge_stop(
    name: str,
    current_user: UserOut = Depends(get_current_user),
):
    c = await _connect(name)
    fn = _pick(c, ("stop_print", "stop"))
    if not fn:
        raise HTTPException(501, "pybambu missing stop API")
    try:
        return fn()
    except Exception as e:
        raise HTTPException(502, detail=f"stop failed: {type(e).__name__}: {e}")

@router.get("/bridge/{name}/camera")
async def bridge_camera(
    name: str,
    current_user: UserOut = Depends(get_current_user),
):
    """
    MJPEG passthrough if your pybambu build exposes it; otherwise 501.
    Supports both async and sync generators.
    """
    c = await _connect(name)
    gen = getattr(c, "camera_mjpeg", None)
    if not callable(gen):
        raise HTTPException(501, "Camera MJPEG not available in this pybambu build")

    try:
        candidate = gen  # function or generator
        # If it's a function, call it to see what we get.
        if inspect.isfunction(gen) or inspect.ismethod(gen):
            candidate = gen()

        # Async generator?
        if inspect.isasyncgen(candidate):
            async def astream() -> AsyncGenerator[bytes, None]:
                async for chunk in candidate:
                    yield chunk
            return StreamingResponse(
                astream(),
                media_type="multipart/x-mixed-replace; boundary=frame",
            )

        # Sync generator?
        if inspect.isgenerator(candidate):
            def sstream() -> Generator[bytes, None, None]:
                for chunk in candidate:
                    yield chunk
            return StreamingResponse(
                sstream(),
                media_type="multipart/x-mixed-replace; boundary=frame",
            )

        # Unknown type
        raise HTTPException(501, "camera_mjpeg returned unsupported type")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, detail=f"camera stream error: {type(e).__name__}: {e}")
