# ===== Builder stage =====
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies for Python packages and OpenGL rendering
RUN apt-get update && apt-get install -y \
    build-essential libpq-dev curl \
    libfreetype6-dev libpng-dev pkg-config \
    libgl1-mesa-dev libglu1-mesa-dev libosmesa6 mesa-utils \
    python3-dev git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir matplotlib imageio[ffmpeg]

# Copy Alembic migrations and env files
COPY alembic.ini /app/alembic.ini
COPY alembic /app/alembic
COPY .env.dev /app/.env.dev

# ===== Runtime stage =====
FROM python:3.12-slim

WORKDIR /app

# Install runtime system packages for OpenGL and fonts
RUN apt-get update && apt-get install -y \
    libpq-dev curl ca-certificates gnupg \
    libfreetype6 libpng16-16 fonts-dejavu-core \
    libgl1-mesa-dev libglu1-mesa-dev libosmesa6 mesa-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ✅ Explicitly install gunicorn/uvicorn in runtime to guarantee availability
RUN pip install --upgrade pip \
 && pip install --no-cache-dir gunicorn uvicorn

# Set matplotlib backend to Agg
ENV MPLBACKEND=Agg

# ✅ Copy Python environment and installed packages from builder
COPY --from=builder /usr/local /usr/local

# Copy Alembic migrations and env files
COPY --from=builder /app/alembic /app/alembic
COPY --from=builder /app/alembic.ini /app/alembic.ini
COPY --from=builder /app/.env.dev /app/.env.dev

# Add cache-bust arg for app code
ARG CACHE_BUST=1

# Copy app code
COPY ./app /app/app

# Copy entrypoint script
COPY ./docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose FastAPI port
EXPOSE 8000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/system/status || exit 1

CMD ["/app/docker-entrypoint.sh"]
