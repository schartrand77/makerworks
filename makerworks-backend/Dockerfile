# syntax=docker/dockerfile:1.5

# ── Backend-only image: Python + FastAPI/uvicorn ─────────────────────────────
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on

WORKDIR /app

# System deps (psycopg needs libpq; keep it lean)
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libpq-dev \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Allow different monorepo layouts (default matches your tree)
ARG BACKEND_DIR=makerworks-backend

# Requirements: use the backend file you actually edited
COPY ${BACKEND_DIR}/requirements.txt /app/requirements.txt

RUN python -m pip install --upgrade pip \
 && pip install --no-cache-dir -r /app/requirements.txt

# App source
COPY ${BACKEND_DIR}/app ./app
COPY ${BACKEND_DIR}/alembic ./alembic
COPY ${BACKEND_DIR}/alembic.ini ./

# Ensure Alembic versions dir exists even if ignored in .dockerignore
RUN test -d alembic/versions || mkdir -p alembic/versions

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
