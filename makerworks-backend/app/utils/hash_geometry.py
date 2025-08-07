# app/utils/hash_geometry.py

import hashlib
from typing import Dict

def generate_geometry_hash(volume: float, dimensions: Dict[str, float], face_count: int, precision: int = 6) -> str:
    """
    Generate a stable SHA-256 hash based on model volume, dimensions, and face count.
    Floats are rounded to avoid tiny precision differences generating different hashes.
    """
    vol = round(volume or 0.0, precision)
    x = round(dimensions.get('x', 0.0), precision)
    y = round(dimensions.get('y', 0.0), precision)
    z = round(dimensions.get('z', 0.0), precision)

    payload = f"{vol}-{x}-{y}-{z}-{face_count}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()
