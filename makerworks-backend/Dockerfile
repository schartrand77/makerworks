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

# Copy Alembic config and scripts
COPY alembic/env.py           ./alembic/env.py
COPY alembic/README           ./alembic/README
COPY alembic/script.py.mako   ./alembic/script.py.mako
COPY alembic.ini              ./

# Ensure the versions directory exists, then copy all your revision files
RUN mkdir -p ./alembic/versions
COPY alembic/versions        ./alembic/versions

# Expose and run
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
