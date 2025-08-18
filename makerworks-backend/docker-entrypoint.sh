#!/usr/bin/env bash
set -Eeuo pipefail

log() { printf '%s %s\n' "$1" "${*:2}"; }
ok()  { log "✅" "$@"; }
warn(){ log "⚠️ " "$@"; }
info(){ log "ℹ️ " "$@"; }
err() { log "❌" "$@"; }

_load_env_file () {
  # Load simple .env files safely:
  # - Supports: KEY=VALUE, export KEY=VALUE, KEY: VALUE (only if no '=')
  # - Trims outer single/double quotes around the whole value
  # - Preserves ':' and '#' inside quoted values (won't chop URLs)
  # - Skips invalid keys and blank/comment lines
  local file="$1"
  [ -f "$file" ] || { warn "No env file found at $file"; return 0; }

  local line key val sep stripped
  while IFS= read -r line || [ -n "$line" ]; do
    # strip CR for CRLF files
    line="${line%$'\r'}"
    # skip blanks & comments
    stripped="${line#"${line%%[![:space:]]*}"}"   # ltrim
    [[ -z "$stripped" || "${stripped:0:1}" == "#" ]] && continue

    # support "export KEY=VALUE"
    if [[ "$stripped" == export[[:space:]]* ]]; then
      stripped="${stripped#export }"
      # ltrim again
      stripped="${stripped#"${stripped%%[![:space:]]*}"}"
    fi

    # choose separator: prefer '='; only fall back to ':' if NO '=' present
    if [[ "$stripped" == *"="* ]]; then
      sep="="
    elif [[ "$stripped" == *":"* ]]; then
      sep=":"
    else
      warn "Skipping malformed line (no '=' or ':'): $line"
      continue
    fi

    key="${stripped%%"$sep"*}"
    val="${stripped#*"$sep"}"

    # trim whitespace around key/val
    key="$(printf '%s' "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    val="$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    # drop outer quotes only if they wrap the entire value
    if [[ "$val" == \"*\" && "$val" == *\" ]]; then
      val="${val:1:${#val}-2}"
    elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
      val="${val:1:${#val}-2}"
    fi

    # validate key
    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      warn "Skipping invalid env key: $key"
      continue
    fi

    # don't override values already present in environment
    if [[ -n "${!key-}" ]]; then
      continue
    fi

    export "$key=$val"
  done < "$file"

  ok "Environment loaded from $(basename "$file")"
}

echo "📦 Loading environment..."
# Conventional precedence: base .env, then .env.dev overrides for local dev
_load_env_file "/app/.env"
_load_env_file "/app/.env.dev"

echo "🕓 Waiting for database..."
# If only DATABASE_URL is set, we still try to use the explicit parts if present.
: "${DATABASE_HOST:=postgres}"
: "${DATABASE_PORT:=5432}"
: "${DATABASE_USER:=makerworks}"
: "${DATABASE_PASSWORD:=makerworks}"

until PGPASSWORD="${DATABASE_PASSWORD}" \
      pg_isready -h "${DATABASE_HOST}" \
                 -p "${DATABASE_PORT}" \
                 -U "${DATABASE_USER}" >/dev/null 2>&1; do
  sleep 1
done
ok "Database is ready"

if [[ "${RUN_MIGRATIONS:-false}" == "true" ]]; then
  echo "📜 Running Alembic migrations..."
  alembic -c alembic.ini upgrade head
fi

# Friendly masked DB URL printout (handles most common formats)
if [[ -n "${DATABASE_URL:-}" ]]; then
  masked="${DATABASE_URL}"
  # mask user:pass in common postgres://user:pass@host forms
  masked="$(printf '%s' "$masked" | sed -E 's#(://)[^:/]+:([^@]+)@#\1****:****@#')"
  info "DB URL in use: ${masked}"
else
  info "DB URL parts: ${DATABASE_USER}@${DATABASE_HOST}:${DATABASE_PORT}"
fi

echo "🚀 Starting application..."
echo "----------------------------------------"
echo "✅ Backend is UP — listening on http://0.0.0.0:8000"
echo "----------------------------------------"

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
