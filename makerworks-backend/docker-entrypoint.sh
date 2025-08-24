#!/usr/bin/env bash
set -euo pipefail

log()  { printf '%s %s\n' "$1" "${*:2}"; }
ok()   { log "✅" "$@"; }
warn() { log "⚠️ " "$@"; }
info() { log "ℹ️ " "$@"; }
err()  { log "❌" "$@"; }

# --- .env loader --------------------------------------------------------------
_load_env_file () {
  local file="$1"
  [ -f "$file" ] || { warn "No env file found at $file"; return 0; }

  local line key val sep stripped
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"                               # strip CR for CRLF files
    stripped="${line#"${line%%[![:space:]]*}"}"        # ltrim
    [[ -z "$stripped" || "${stripped:0:1}" == "#" ]] && continue

    if [[ "$stripped" == export[[:space:]]* ]]; then   # support "export KEY=VALUE"
      stripped="${stripped#export }"
      stripped="${stripped#"${stripped%%[![:space:]]*}"}"
    fi

    if [[ "$stripped" == *"="* ]]; then sep="="        # prefer '='
    elif [[ "$stripped" == *":"* ]]; then sep=":"      # fallback ':' only if no '='
    else
      warn "Skipping malformed line (no '=' or ':'): $line"; continue
    fi

    key="${stripped%%"$sep"*}"; val="${stripped#*"$sep"}"
    key="$(printf '%s' "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    val="$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    # drop only full-wrap quotes
    if [[ "$val" == \"*\" && "$val" == *\" ]]; then val="${val:1:${#val}-2}"; fi
    if [[ "$val" == \'*\' && "$val" == *\' ]]; then val="${val:1:${#val}-2}"; fi

    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { warn "Skipping invalid env key: $key"; continue; }
    [[ -n "${!key-}" ]] && continue                   # don't override existing

    export "$key=$val"
  done < "$file"

  ok "Environment loaded from $(basename "$file")"
}

echo "📦 Loading environment…"
_load_env_file "/app/.env"
_load_env_file "/app/.env.dev"

# --- DB URL normalization ------------------------------------------------------
# Prefer provided DATABASE_URL; otherwise synthesize a sane default
: "${DATABASE_URL:=postgresql+asyncpg://makerworks:makerworks@postgres:5432/makerworks}"

coerce_sync_url () {
  local u="$1"
  u="${u/+asyncpg/+psycopg}"
  u="${u/+aiopg/+psycopg}"
  u="${u/+psycopg2/+psycopg}"
  [[ "$u" == postgresql://* ]] && u="${u/postgresql:\/\//postgresql+psycopg://}"
  printf '%s' "$u"
}

ALEMBIC_URL="$(coerce_sync_url "$DATABASE_URL")"
# psql can’t handle +psycopg in scheme; strip it back to plain postgresql
PSQL_URL="${ALEMBIC_URL/+psycopg/}"

# --- DB readiness --------------------------------------------------------------
echo "🕓 Waiting for database…"
until psql "$PSQL_URL" -c '\q' >/dev/null 2>&1; do sleep 1; done
ok "Database is ready"

# --- Alembic at runtime (idempotent) ------------------------------------------
# Always run unless explicitly disabled
: "${RUN_MIGRATIONS_ON_START:=1}"
: "${RUN_MIGRATIONS:=false}"  # backward-compat: true/false

if [[ "$RUN_MIGRATIONS_ON_START" = "1" || "$RUN_MIGRATIONS" = "true" ]]; then
  echo "📜 Running Alembic migrations…"
  export ALEMBIC_URL

  # Ensure the migration repo has at least one head; create empty baseline if not
  if [[ -z "$(alembic heads 2>/dev/null | tr -d ' \n')" ]]; then
    echo "🧱 No migration heads found → creating empty baseline"
    alembic revision -m "baseline" --empty
  fi

  # If DB has tables but no version table → stamp head to align
  HAS_VER_TABLE="$(psql "$PSQL_URL" -tAc \
    "select 1 from information_schema.tables where table_schema='public' and table_name='alembic_version'")" || HAS_VER_TABLE=""
  if [[ "$HAS_VER_TABLE" != "1" ]]; then
    COUNT="$(psql "$PSQL_URL" -tAc \
      "select count(*)::int from information_schema.tables where table_schema='public'")"
    if [[ "${COUNT:-0}" -gt 0 ]]; then
      echo "⚠️  No alembic_version but ${COUNT} tables exist → stamping head"
      alembic stamp head
    else
      echo "📭 Empty DB → upgrade will create schema"
    fi
  else
    echo "✅ alembic_version table exists"
  fi

  echo "🚀 alembic upgrade head"
  alembic upgrade head
  ok "Migrations complete"
else
  echo "⏭️  Skipping migrations (RUN_MIGRATIONS_ON_START=0 and RUN_MIGRATIONS!=true)"
fi

# --- Friendly DB URL printout --------------------------------------------------
if [[ -n "${DATABASE_URL:-}" ]]; then
  masked="$(printf '%s' "$DATABASE_URL" | sed -E 's#(://)[^:/]+:([^@]+)@#\1****:****@#')"
  info "DB URL in use: ${masked}"
else
  info "DB URL parts: (env not set)"
fi

# --- Launch app ---------------------------------------------------------------
echo "🚀 Starting application…"
echo "----------------------------------------"
echo "✅ Backend is UP — listening on http://0.0.0.0:8000"
echo "----------------------------------------"

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
