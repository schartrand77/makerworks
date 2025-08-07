#!/bin/bash
set -e

echo "🔥 Nuking Alembic migrations and database schema..."

# Go inside the backend container
docker exec -it makerworks_backend bash -c '
  cd /app

  echo "➡️  Removing all Alembic versions..."
  rm -rf alembic/versions/*
  
  echo "➡️  Dropping and recreating public schema..."
  psql -U makerworks -h makerworks_postgres -d makerworks -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

  echo "➡️  Generating fresh base migration..."
  alembic revision --autogenerate -m "initial schema"

  echo "➡️  Upgrading to head..."
  alembic upgrade head

  echo "✅ Alembic reset complete. You now have a single clean head."
'