# app/routes/ws_status.py

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.dependencies.auth import get_user_from_token_query
from app.services.redis_service import get_redis
from app.services.session_status import set_session_status
from app.utils.system_info import get_system_status_snapshot
from app.utils.log_utils import logger

router = APIRouter()


@router.websocket("/system/status")
async def system_status_ws(websocket: WebSocket):
    redis = await get_redis()
    user = await get_user_from_token_query(websocket)
    if not user:
        logger.warning("🛑 WebSocket connection rejected: invalid or missing token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info(f"📡 WebSocket connection opened for user_id={user.id}")
    await set_session_status(redis, str(user.id), "connected")

    try:
        while True:
            status_data = get_system_status_snapshot()
            logger.debug(f"🔄 Sending system status to user_id={user.id}")
            await websocket.send_json(status_data)
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        logger.info(f"❌ WebSocket disconnected for user_id={user.id}")
    except Exception as e:
        logger.exception(f"🔥 Unexpected WebSocket error for user_id={user.id}: {e}")
    finally:
        await set_session_status(redis, str(user.id), "disconnected")
        logger.info(f"🧹 WebSocket cleanup complete for user_id={user.id}")
