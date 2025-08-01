PROJECT_NAME=makerworks
COMPOSE=docker-compose
DEV_CONTAINER=docker exec -it $(PROJECT_NAME)_backend

.PHONY: up down logs restart build shell backend frontend db reset-db migrate revision upgrade downgrade seed

## 🚀 Start all services (frontend + backend + DB + Redis)
up:
	$(COMPOSE) up -d

## 🛑 Stop all services
down:
	$(COMPOSE) down

## 🔄 Restart backend service
restart:
	$(COMPOSE) restart backend

## 🏗️ Build all containers from scratch
build:
	$(COMPOSE) build --no-cache

## 📜 Tail logs from backend & frontend
logs:
	$(COMPOSE) logs -f backend frontend

## 🐚 Open a shell in the backend container
shell:
	$(DEV_CONTAINER) /bin/bash

## ▶️ Run backend (FastAPI dev mode)
backend:
	$(DEV_CONTAINER) uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

## ▶️ Run frontend (Vite dev server)
frontend:
	cd makerworks-frontend && npm run dev

## 🗄️ Access PostgreSQL CLI
db:
	docker exec -it $(PROJECT_NAME)_postgres psql -U makerworks -d makerworks

## 💣 Drop & recreate the database (⚠️ destructive!)
reset-db:
	docker exec -it $(PROJECT_NAME)_postgres psql -U makerworks -d postgres -c "DROP DATABASE makerworks;"
	docker exec -it $(PROJECT_NAME)_postgres psql -U makerworks -d postgres -c "CREATE DATABASE makerworks;"
	$(DEV_CONTAINER) alembic upgrade head
	$(MAKE) seed

## 📦 Create a new Alembic migration (autogenerate)
migrate:
	$(DEV_CONTAINER) alembic revision --autogenerate -m "auto migration"
	@echo "✅ New migration created. Run 'make upgrade' to apply it."

## ✍️ Create a blank Alembic revision (manual)
revision:
	$(DEV_CONTAINER) alembic revision -m "manual migration"
	@echo "✅ Blank migration created. Edit it before applying."

## ⬆️ Apply all pending migrations
upgrade:
	$(DEV_CONTAINER) alembic upgrade head
	$(MAKE) seed

## ⬇️ Downgrade last migration
downgrade:
	$(DEV_CONTAINER) alembic downgrade -1

## 🌱 Seed the database with initial data
	seed:
	@echo "🌱 Seeding database with default data..."
	$(DEV_CONTAINER) python app/utils/seed_db.py
	@echo "✅ Database seeded successfully."
