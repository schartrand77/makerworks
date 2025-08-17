# MakerWorks Backend

This is the FastAPI + Celery + PostgreSQL backend powering the MakerWorks 3D printing platform.

## Features
- 🔐 JWT Auth, Signup, Login
- 🔧 Upload & STL metadata extraction
- 📸 Thumbnail rendering (Trimesh)
- 🎯 Redis queue + Celery for background jobs
- 📁 PostgreSQL via SQLAlchemy
- 🖼️ Avatar uploads via `/api/v1/users/avatar`
- 📈 Prometheus metrics & Grafana dashboards

The repository ships with a `.env.example` file containing all the
environment variables required to run the application. Copy it to `.env`
and update the values for your environment. For production deployments,
**`SECRET_KEY`** and **`SESSION_SECRET`** must be set to non-default values or
the application will raise an error on startup.

Additional guidance on contributing new routes and features can be found in
[docs/FUTURE_API_GUIDELINES.md](docs/FUTURE_API_GUIDELINES.md).

## Dev Setup

```bash
python3 -m venv venv
source venv/bin/activate
poetry install  # installs dependencies defined in pyproject.toml
# alternatively, use `pip install -r requirements.txt`
cp .env.example .env
# edit .env and update the connection strings and secrets as needed
# `.env.example` lists all required environment variables
alembic upgrade head
uvicorn app.main:app --reload
```

> **Note**
> The `docker-compose.yml` file no longer forces the `linux/arm64` platform.
> Docker will now choose the correct architecture automatically, so containers
> start correctly on both Intel/AMD and Apple Silicon machines.

## CLI

The `mw` command provides helper utilities such as database setup and running
Alembic migrations. See [CLI.md](CLI.md) for the full manual. Example:

```bash
mw update alembic head
```

## Monitoring

Prometheus metrics are exposed at `/metrics` and secured with `METRICS_API_KEY`.
Grafana and Prometheus services are provided via `docker-compose`. Start them
with:

```bash
docker-compose up prometheus grafana
```

## License
MIT
