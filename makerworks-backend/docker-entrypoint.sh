#!/bin/bash

set -e  # Exit immediately on error

echo "📦 Loading environment..."
if [ -f "/app/.env.dev" ]; then
  export $(grep -v '^#' /app/.env.dev | xargs)
  echo "✅ Environment loaded from .env.dev"
else
  echo "⚠️  No .env.dev file found"
fi

echo "🕓 Waiting for database..."
until pg_isready -h "${DATABASE_HOST:-postgres}" -p "${DATABASE_PORT:-5432}" -U "${DATABASE_USER:-postgres}"; do
  sleep 1
done
echo "✅ Database is ready"

echo "📜 Running Alembic migrations..."
alembic upgrade head

echo "🚀 Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
