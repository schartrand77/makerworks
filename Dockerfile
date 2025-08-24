# Dockerfile — makerworks (single-stage, monorepo-aware)

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    # let the entrypoint auto-run alembic at runtime (idempotent)
    RUN_MIGRATIONS_ON_START=1

WORKDIR /app

# System deps:
# - libpq-dev: build headers for psycopg if needed
# - postgresql-client: gives us `psql` so entrypoint can wait on DB
RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        postgresql-client \
        curl; \
    rm -rf /var/lib/apt/lists/*

# Allow different monorepo layouts (default matches your tree)
ARG BACKEND_DIR=makerworks-backend

# Python deps (install psycopg v3 driver explicitly so Alembic can use +psycopg)
COPY ${BACKEND_DIR}/requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip \
 && pip install --no-cache-dir "psycopg[binary]>=3.1" "psycopg2-binary>=2.9" \
 && pip install --no-cache-dir -r /app/requirements.txt

# App source
COPY ${BACKEND_DIR}/app ./app
COPY ${BACKEND_DIR}/alembic ./alembic
COPY ${BACKEND_DIR}/alembic.ini ./

# Ensure Alembic versions dir exists even if ignored in .dockerignore
RUN test -d alembic/versions || mkdir -p alembic/versions

# Runtime entrypoint that: waits for DB → baseline if repo empty → stamp if no version table → upgrade head → start uvicorn
# (expects the script to live in makerworks-backend/)
COPY ${BACKEND_DIR}/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && sed -i 's/\r$//' /app/docker-entrypoint.sh

EXPOSE 8000

# The entrypoint starts uvicorn by default if no args are given
ENTRYPOINT ["./docker-entrypoint.sh"]
# If you prefer, you can uncomment the next line to pass explicit args to uvicorn:
# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]