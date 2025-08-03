# syntax=docker/dockerfile:1.5

##############################################
# ===== Base Stage: Pre-built Python Dependencies =====
##############################################
# ✅ Accept platform arg but don't force --platform for local builds
ARG TARGETPLATFORM
FROM makerworks-backend-base:latest AS base

WORKDIR /app

##############################################
# ===== Builder Stage (App Layer) =====
##############################################
ARG TARGETPLATFORM
FROM base AS builder

WORKDIR /app

# ✅ Flag to toggle worker dependencies
ARG WORKER_IMAGE=false

# ✅ If worker, install Celery extras (reuses cached base layer)
RUN if [ "$WORKER_IMAGE" = "true" ]; then \
        echo "📦 Installing Celery + Redis extras for worker..."; \
        pip install --no-cache-dir celery[redis]; \
    fi

# Copy Alembic migrations and env
COPY alembic.ini /app/alembic.ini
COPY alembic /app/alembic

COPY .env.example /app/.env.dev

##############################################
# ===== Runtime Stage =====
##############################################
ARG TARGETPLATFORM
FROM python:3.12-slim AS final

WORKDIR /app

# ✅ Minimal runtime OS deps
RUN apt-get update && apt-get install -y \
    libpq-dev curl ca-certificates \
    libfreetype6 libpng16-16 fonts-dejavu-core \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ✅ Copy Python environment from pre-built base image
COPY --from=base /usr/local /usr/local

# Copy Alembic migrations and env
COPY --from=builder /app/alembic /app/alembic
COPY --from=builder /app/alembic.ini /app/alembic.ini
COPY --from=builder /app/.env.dev /app/.env.dev

# ✅ Add cache-bust arg to invalidate code layer without touching deps
ARG CACHE_BUST=1

# ✅ Copy source code only (fast rebuilds)
COPY ./app /app/app

# Copy entrypoint
COPY ./docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

ENV MPLBACKEND=Agg

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/system/status || exit 1

CMD ["/app/docker-entrypoint.sh"]
