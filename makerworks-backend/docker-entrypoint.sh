#!/usr/bin/env bash
set -euo pipefail

echo "📦 Loading environment..."
if [ -f "/app/.env.dev" ]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    if [[ "$line" == *:* ]]; then
      key=${line%%:*}
      val=${line#*:}
    elif [[ "$line" == *=* ]]; then
      key=${line%%=*}
      val=${line#*=}
    else
      continue
    fi

    key=$(printf '%s' "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    val=$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

    case "$val" in
      \"*\" ) val=${val#\"}; val=${val%\"} ;;
      \'*\' ) val=${val#\'}; val=${val%\'} ;;
    esac

    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      echo "⚠️  Skipping invalid env key: $key"
      continue
    fi

    if [ -n "${!key:-}" ]; then
      continue
    fi

    export "$key"="$val"
  done < /app/.env.dev

  echo "✅ Environment loaded from .env.dev"
else
  echo "⚠️  No .env.dev file found"
fi

echo "🕓 Waiting for database..."
until PGPASSWORD="${DATABASE_PASSWORD:-makerworks}" \
      pg_isready -h "${DATABASE_HOST:-postgres}" \
                 -p "${DATABASE_PORT:-5432}" \
                 -U "${DATABASE_USER:-makerworks}" >/dev/null 2>&1; do
  sleep 1
done
echo "✅ Database is ready"

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "📜 Running Alembic migrations..."
  alembic -c alembic.ini upgrade head
fi

if [ -n "${DATABASE_URL:-}" ]; then
  masked="${DATABASE_URL//:\/\/${DATABASE_USER:-makerworks}:${DATABASE_PASSWORD:-makerworks}/:\/\/****:****}"
  echo "🔗 DB URL in use: ${masked}"
fi

echo "🚀 Starting application..."
echo "----------------------------------------"
echo "✅ Backend is UP — listening on http://0.0.0.0:8000"
echo "----------------------------------------"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
