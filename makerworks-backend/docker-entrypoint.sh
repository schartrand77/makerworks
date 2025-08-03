#!/usr/bin/env bash
set -e

echo "🚀 [Entrypoint] Starting MakerWorks Backend"
echo "📦 ENV: ${ENV:-development}"
echo "📦 DB: ${DATABASE_URL}"
echo "📦 Redis: ${REDIS_URL}"

# ──────────────────────────────────────────────
# ✅ Wait for Postgres using Python check
# ──────────────────────────────────────────────
echo "⏳ Waiting for Postgres at ${DATABASE_URL} ..."
python <<'EOF'
import os, time, sys, asyncpg, asyncio
url = os.getenv("DATABASE_URL")
async def check():
    for i in range(60):
        try:
            conn = await asyncpg.connect(url)
            await conn.close()
            print("✅ Postgres is ready!")
            return
        except Exception as e:
            print(f"⏳ Postgres not ready yet... ({i+1}) {e}")
            time.sleep(1)
    print("❌ Postgres did not become ready after 60 seconds")
    sys.exit(1)
asyncio.run(check())
EOF

# ──────────────────────────────────────────────
# ✅ Auto-run Alembic migrations
# ──────────────────────────────────────────────
echo "📜 Running Alembic migrations..."
alembic upgrade head || { echo "❌ Alembic migration failed"; exit 1; }

# ──────────────────────────────────────────────
# ✅ Verify users table exists
# ──────────────────────────────────────────────
python <<'EOF'
import os, psycopg2
from urllib.parse import urlparse

url = os.getenv("DATABASE_URL").replace("+asyncpg","")
parsed = urlparse(url)
conn = psycopg2.connect(
    dbname=parsed.path.lstrip("/"),
    user=parsed.username,
    password=parsed.password,
    host=parsed.hostname,
    port=parsed.port or 5432,
)
cur = conn.cursor()
cur.execute("SELECT to_regclass('public.users');")
exists = cur.fetchone()[0]
if not exists:
    print("❌ Users table does not exist after migrations! Aborting startup.")
    sys.exit(1)
print("✅ Users table exists.")
conn.close()
EOF

# ──────────────────────────────────────────────
# ✅ Start Gunicorn
# ──────────────────────────────────────────────
exec gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000
