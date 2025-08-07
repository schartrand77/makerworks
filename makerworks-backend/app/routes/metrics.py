from fastapi import APIRouter, Depends
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.dependencies.metrics import verify_metrics_api_key

router = APIRouter()


@router.get("", include_in_schema=False, dependencies=[Depends(verify_metrics_api_key)])
async def metrics() -> Response:
    """Expose Prometheus metrics."""
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)
