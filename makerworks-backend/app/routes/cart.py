# app/routes/cart.py

from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def get_cart():
    return {"cart": [], "message": "Cart route stub is live"}
