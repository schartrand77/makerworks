# scripts/post_migration_check.py
import psycopg2
from psycopg2.extras import RealDictCursor

REQUIRED_TABLES = [
    'users', 'filaments', 'estimates', 'filament_pricing',
    'model_uploads', 'audit_logs', 'upload_jobs', 'estimate_settings',
]

def check_tables():
    conn = psycopg2.connect("postgresql://makerworks:makerworks@postgres:5432/makerworks")
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
    existing = {row["table_name"] for row in cursor.fetchall()}

    for table in REQUIRED_TABLES:
        if table not in existing:
            print(f"❌ Missing table: {table}")
        else:
            print(f"✅ Found table: {table}")

    conn.close()

if __name__ == "__main__":
    check_tables()
