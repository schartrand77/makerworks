# app/routes/health.py
from fastapi import APIRouter, Response

router = APIRouter()

@router.get("/healthz", include_in_schema=False)
async def healthz():
    return {"status": "ok"}

# Back-compat for anything expecting these:
@router.get("/api/v1/healthz", include_in_schema=False)
async def healthz_v1():
    return {"status": "ok"}

@router.get("/api/v1/system/status", include_in_schema=False)
async def system_status():
    return {"status": "ok"}
