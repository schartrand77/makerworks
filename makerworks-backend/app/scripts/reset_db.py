#!/usr/bin/env python3
import os
import platform
import shutil
import subprocess
import psycopg2
from pathlib import Path

# Detect environment
IS_MACOS = platform.system() == "Darwin"
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Env defaults with macOS override
DB_NAME = os.getenv("POSTGRES_DB", "makerworks")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "postgres")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost" if IS_MACOS else "postgresql15")

# Use local uploads dir on macOS
UPLOADS_PATH = os.getenv(
    "UPLOADS_PATH",
    str(PROJECT_ROOT / "uploads") if IS_MACOS else "/app/uploads"
)

def drop_and_recreate_db():
    print(f"💣 Dropping and recreating database: {DB_NAME} on {DB_HOST}")
    conn = psycopg2.connect(dbname="postgres", user=DB_USER, password=DB_PASS, host=DB_HOST)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{DB_NAME}';")
    cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME};")
    cur.execute(f"CREATE DATABASE {DB_NAME};")
    cur.close()
    conn.close()
    print("✅ Database recreated")

def delete_migrations():
    versions_path = PROJECT_ROOT / "alembic" / "versions"
    if versions_path.is_dir():
        print(f"🧹 Removing old migration files in {versions_path}")
        for file in versions_path.glob("*.py"):
            file.unlink()
        print("✅ Migration files cleared")

def run_migrations():
    print("📜 Generating fresh migration")
    subprocess.run(["alembic", "revision", "--autogenerate", "-m", "initial schema"], check=True)
    print("⬆️ Applying migrations")
    subprocess.run(["alembic", "upgrade", "head"], check=True)
    print("✅ Migrations applied")

def clean_uploads():
    uploads_dir = Path(UPLOADS_PATH)
    if uploads_dir.is_dir():
        print(f"🧹 Cleaning uploads at {uploads_dir}")
        for root, dirs, files in os.walk(uploads_dir):
            for name in files:
                os.remove(os.path.join(root, name))
            for name in dirs:
                shutil.rmtree(os.path.join(root, name))
        print("✅ Uploads folder cleaned")

def seed_defaults():
    print("🌱 Seeding default data")
    subprocess.run(["python", str(PROJECT_ROOT / "scripts" / "seed_filaments.py")], check=False)
    subprocess.run(["python", str(PROJECT_ROOT / "scripts" / "seed_admin.py")], check=False)
    print("✅ Defaults seeded")

if __name__ == "__main__":
    drop_and_recreate_db()
    delete_migrations()
    run_migrations()
    clean_uploads()
    seed_defaults()
    print("🎉 Full reset completed")
