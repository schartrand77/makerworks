# app/utils/serializers.py

from app.models import ModelMetadata
from typing import Dict, Any


def model_to_dict(model: ModelMetadata) -> Dict[str, Any]:
    """
    Serialize a ModelMetadata instance into a dictionary for API responses.
    """
    return {
        "id": str(model.id),
        "name": model.name,
        "filename": model.filename,
        "user_id": str(model.user_id),
        "uploader": getattr(model, "uploader", None),
        "uploaded_at": model.uploaded_at.isoformat() if model.uploaded_at else None,
        "file_url": model.file_url,
        "thumbnail_url": model.thumbnail_url,
        "volume": getattr(model, "volume", None),
        "bbox": getattr(model, "bbox", None),
        "faces": getattr(model, "faces", None),
        "vertices": getattr(model, "vertices", None),
        "geometry_hash": getattr(model, "geometry_hash", None),
        "is_duplicate": getattr(model, "is_duplicate", False),
        "preview_image": getattr(model, "preview_image", None),
    }
