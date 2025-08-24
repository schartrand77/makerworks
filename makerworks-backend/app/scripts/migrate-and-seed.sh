#!/bin/sh
set -eu

log() { printf '%s %s\n' "$1" "$2"; }

log "⏳" "Waiting for PostgreSQL..."
until psql "postgresql://makerworks:makerworks@postgres:5432/makerworks" -c '\q' >/dev/null 2>&1; do
  sleep 1
done

# DATABASE_URL → Alembic URL (+psycopg) and PSQL_URL (no +psycopg)
DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://makerworks:makerworks@postgres:5432/makerworks}"
ALEMBIC_URL="$(printf '%s\n' "$DATABASE_URL" \
  | sed -e 's/+asyncpg/+psycopg/' -e 's/^postgresql:\/\//postgresql+psycopg:\/\//')"
PSQL_URL="$(printf '%s\n' "$ALEMBIC_URL" | sed -e 's/+psycopg//')"

log "ℹ️" "ALEMBIC_URL=$ALEMBIC_URL"

# Ensure repo has a head
HEADS="$(ALEMBIC_URL="$ALEMBIC_URL" alembic -c alembic.ini heads 2>/dev/null | tr -d ' \n')"
if [ -z "$HEADS" ]; then
  log "🧱" "No migration heads → creating empty baseline revision"
  ALEMBIC_URL="$ALEMBIC_URL" alembic -c alembic.ini revision -m "baseline" --empty
fi

# If DB has tables but no alembic_version → stamp head
if psql "$PSQL_URL" -tAc "select 1 from information_schema.tables where table_schema='public' and table_name='alembic_version'" | grep -q 1; then
  log "✅" "alembic_version exists"
else
  COUNT="$(psql "$PSQL_URL" -tAc "select count(*) from information_schema.tables where table_schema='public'")"
  if [ "${COUNT:-0}" != "0" ]; then
    log "⚠️" "Found $COUNT tables → stamping head"
    ALEMBIC_URL="$ALEMBIC_URL" alembic -c alembic.ini stamp head
  else
    log "📭" "Empty DB → fresh upgrade will create schema"
  fi
fi

# Upgrade head
log "🚀" "alembic upgrade head"
ALEMBIC_URL="$ALEMBIC_URL" alembic -c alembic.ini upgrade head

# Seed admin (never rotates password; generates if blank)
log "👤" "Seeding admin…"
python -m app.startup.admin_seed

# If the seeder generated a password, surface it
if [ -f /app/first-admin.txt ]; then
  log "🔑" "Wrote /app/first-admin.txt (copy it with: docker cp makerworks_migrate:/app/first-admin.txt .)"
  cat /app/first-admin.txt
fi

log "✅" "Migrations + admin seed complete"
