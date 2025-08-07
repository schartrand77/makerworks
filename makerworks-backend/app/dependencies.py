# app/dependencies.py


import stripe
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config.settings import settings
from app.db.database import get_async_db
from app.models.models import User
from app.schemas.checkout import CheckoutRequest
from app.services.token_service import decode_token


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_async_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    token = authorization.split(" ")[1]
    try:
        payload = decode_token(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    """
    Raise 403 if user is not admin.
    """
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required."
        )
    return user


async def admin_required(user: User = Depends(get_current_user)) -> User:
    """
    Alias to get_current_admin for lightweight access control.
    """
    return await get_current_admin(user)


async def create_checkout_session(
    data: CheckoutRequest,
    user: User = Depends(get_current_user),
):
    """
    Create a Stripe Checkout session from request data and user info.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": int(data.total_cost * 100),  # dollars → cents
                        "product_data": {"name": data.description},
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            customer_email=user.email,
            success_url=f"{settings.DOMAIN}/success",
            cancel_url=f"{settings.DOMAIN}/cancel",
        )

        return {"checkout_url": session.url}

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error") from e
