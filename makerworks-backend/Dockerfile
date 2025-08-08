# syntax=docker/dockerfile:1.5

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY app ./app

# Copy entire Alembic directory (env.py, script.py.mako, README, versions/, etc.)
COPY alembic ./alembic
COPY alembic.ini ./

# Ensure versions subfolder is present even if empty
RUN test -d alembic/versions || mkdir -p alembic/versions

# Expose and run
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
