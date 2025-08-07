# app/routes/checkout.py

import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_db
from app.dependencies.auth import get_current_user
from app.models import Estimate, User, CheckoutSession
from app.tasks.render import generate_gcode
from app.config.settings import get_settings
from app.schemas.checkout import (
    CheckoutRequest,
    CheckoutSessionOut,
    PaginatedCheckoutSessions,
)
from app.schemas.enums import CurrencyEnum

logger = logging.getLogger(__name__)

router = APIRouter()

# ───────────────────────────────────────────────
# Stripe Setup
# ───────────────────────────────────────────────
settings = get_settings()

stripe.api_key = settings.stripe_secret_key
DOMAIN = settings.domain
WEBHOOK_SECRET = settings.stripe_webhook_secret

if not stripe.api_key:
    logger.warning("⚠️ STRIPE_SECRET_KEY is not set. Checkout endpoints will return 503.")

# ───────────────────────────────────────────────
# Create Stripe Checkout Session
# ───────────────────────────────────────────────
@router.post("/session", summary="Create a Stripe Checkout session")
async def create_checkout_session(
    data: CheckoutRequest,
    db: AsyncSession = Depends(get_async_db),
    user: User = Depends(get_current_user),
):
    """
    Create a Stripe Checkout session for the submitted cart and persist it in the DB.
    """
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    try:
        stripe_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": data.currency.value,
                        "product_data": {
                            "name": item.name,
                            "description": data.description,
                        },
                        "unit_amount": int(item.cost * 100),  # cents
                    },
                    "quantity": 1,
                }
                for item in data.items
            ],
            mode="payment",
            customer_email=user.email,
            success_url=f"{DOMAIN}/checkout/success",
            cancel_url=f"{DOMAIN}/checkout/cancel",
            metadata={
                "user_id": str(user.id),
                "description": data.description,
                "item_count": str(len(data.items)),
            },
        )

        # Persist session in DB
        new_session = CheckoutSession(
            id=stripe_session.id,
            user_id=user.id,
            total_cost=data.total_cost,
            description=data.description,
            currency=data.currency,
            items=[item.model_dump() for item in data.items],
        )
        db.add(new_session)
        await db.commit()

        logger.info("✅ Stripe session created: %s", stripe_session.id)
        return {"id": stripe_session.id, "url": stripe_session.url}

    except Exception as e:
        logger.error("❌ Stripe session error: %s", e)
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e

# ───────────────────────────────────────────────
# Stripe Webhook Handler
# ───────────────────────────────────────────────
@router.post("/webhook", summary="Stripe webhook endpoint")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_async_db)):
    """
    Handle Stripe webhook events to mark payments complete & trigger G-code task.
    """
    if not WEBHOOK_SECRET:
        logger.warning("⚠️ STRIPE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    payload = await request.body()
    sig = request.headers.get("stripe-signature")

    if not sig:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
        logger.info("📡 Webhook event received: %s", event["type"])
    except stripe.error.SignatureVerificationError:
        logger.error("❌ Stripe webhook signature invalid")
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    if event["type"] == "checkout.session.completed":
        session_data = event["data"]["object"]
        session_id = session_data.get("id")

        logger.info("✅ Payment complete for session: %s", session_id)

        try:
            db_session = await db.get(CheckoutSession, session_id)
            if db_session:
                db_session.completed = True
                await db.commit()
                logger.info("💳 Checkout session %s marked as completed", session_id)

                # Optionally queue work per model (e.g., G-code)
                for item in db_session.items:
                    model_id = item.get("model_id")
                    estimate_id = item.get("estimate_id")
                    if model_id and estimate_id:
                        try:
                            generate_gcode.delay(int(model_id), int(estimate_id))
                            logger.info("📤 G-code task queued for model %s", model_id)
                        except Exception as e:
                            logger.error("❌ Celery enqueue failed: %s", e)
            else:
                logger.warning("⚠️ CheckoutSession %s not found", session_id)
        except Exception as e:
            logger.error("❌ DB update failed: %s", e)

    return {"status": "success"}

# ───────────────────────────────────────────────
# User Checkout History (Paginated)
# ───────────────────────────────────────────────
@router.get("/history", response_model=PaginatedCheckoutSessions)
async def get_checkout_history(
    db: AsyncSession = Depends(get_async_db),
    user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
):
    """
    Return paginated checkout session history for the current user.
    """
    offset = (page - 1) * per_page
    result = await db.execute(
        CheckoutSession.__table__.select()
        .where(CheckoutSession.user_id == user.id)
        .order_by(CheckoutSession.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    rows = result.mappings().all()
    total = await db.scalar(
        CheckoutSession.__table__.count().where(CheckoutSession.user_id == user.id)
    )

    return PaginatedCheckoutSessions(
        total=total,
        page=page,
        per_page=per_page,
        sessions=rows,
    )
