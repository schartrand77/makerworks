#!/bin/bash
set -euo pipefail

cd /app

# Start the FastAPI app with Gunicorn + Uvicorn workers
# ✅ Increased timeout to avoid worker timeouts on heavy startup or long requests
# ✅ Ensured async-friendly worker class
# ✅ Added graceful shutdown and keep-alive tuning for production
exec gunicorn \
    app.main:app \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5
