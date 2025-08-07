from fastapi import Header, HTTPException, status
from app.core.config import settings


def verify_metrics_api_key(x_api_key: str = Header(None)):
    """
    Dependency to verify the X-API-Key header against METRICS_API_KEY in settings.
    • If METRICS_API_KEY is not set, skip validation entirely (dev mode).
    • Adds debug logging to help trace failures.
    """
    configured_key = getattr(settings, "metrics_api_key", None)

    # Debug output to container logs
    print(f"[Metrics] Configured key: {configured_key} | Provided key: {x_api_key}")

    # ✅ Skip validation if no metrics_api_key is configured (dev/local)
    if not configured_key:
        print("[Metrics] Skipping API key validation (no key configured)")
        return

    if x_api_key != configured_key:
        print("[Metrics] Invalid API key detected")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Metrics API Key",
        )

    print("[Metrics] API key validation passed")
