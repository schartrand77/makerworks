#!/bin/bash
set -e

echo "📦 Running Alembic migrations on startup..."
alembic upgrade head || {
  echo "❌ Alembic migration failed"
  exit 1
}

echo "✅ Database migrations are up to date."

echo "🚀 Starting MakerWorks API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
