"""
Central API router for MakerWorks.

Each module below defines its own `router`, which is imported here,
namespaced with a prefix, and included in the top-level `router`.

Note: The filaments router is mounted directly in main.py at
      /api/v1/filaments to avoid duplicate mounts (and 422s).
"""

from fastapi import APIRouter

# Individual route imports (alphabetical where applicable)
from .admin import router as admin_router
from .auth import router as auth_router
from .bambu_connect import router as bambu_router
from .cart import router as cart_router
from .checkout import router as checkout_router
from .favorites import router as favorites_router
# from .filaments import router as filaments_router  # mounted in main.py to avoid duplicates
from .models import router as models_router
from .system import router as system_router
from .upload import router as upload_router
from .users import router as users_router
from .metrics import router as metrics_router

# Central API router
router = APIRouter()

# Register each router under its prefix & tag
router.include_router(admin_router, prefix="/admin", tags=["admin"])
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(bambu_router, prefix="/bambu", tags=["bambu"])
router.include_router(cart_router, prefix="/cart", tags=["cart"])
router.include_router(checkout_router, prefix="/checkout", tags=["checkout"])
router.include_router(favorites_router, prefix="/favorites", tags=["favorites"])
# router.include_router(filaments_router, prefix="/filaments", tags=["filaments"])  # mounted in main.py
router.include_router(models_router, prefix="/models", tags=["models"])
router.include_router(system_router, prefix="/system", tags=["system"])
router.include_router(upload_router, prefix="/upload", tags=["upload"])
router.include_router(users_router, prefix="/users", tags=["users"])
router.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
