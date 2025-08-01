#!/bin/bash
set -e

echo "📦 Waiting for Postgres to be ready..."
until pg_isready -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  sleep 1
done
echo "✅ Postgres is up."

echo "📜 Running Alembic migrations on startup..."
alembic upgrade head || {
  echo "❌ Alembic migration failed"
  exit 1
}
echo "✅ Database migrations are up to date."

echo "🚀 Starting MakerWorks API under Gunicorn..."
exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    -b 0.0.0.0:8000 \
    --workers 4 \
    --timeout 120
