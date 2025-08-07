-- Drop all connections to the DB
DO
$$
BEGIN
   IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'makerworks') THEN
      PERFORM pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = 'makerworks' AND pid <> pg_backend_pid();
   END IF;
END
$$;

-- Drop database if exists
DROP DATABASE IF EXISTS makerworks;

-- Drop user if exists
DROP ROLE IF EXISTS makerworks;

-- Recreate user
CREATE ROLE makerworks WITH LOGIN PASSWORD 'makerworks';

-- Recreate database owned by makerworks
CREATE DATABASE makerworks OWNER makerworks;

-- Connect to new DB
\c makerworks

-- Change ownership of public schema to makerworks
ALTER SCHEMA public OWNER TO makerworks;

-- Grant all privileges on DB
GRANT ALL PRIVILEGES ON DATABASE makerworks TO makerworks;

-- Grant all privileges on schema
GRANT ALL PRIVILEGES ON SCHEMA public TO makerworks;
GRANT USAGE, CREATE ON SCHEMA public TO makerworks;

-- Show result
\dn+
