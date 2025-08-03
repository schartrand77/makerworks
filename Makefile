PROJECT_NAME=makerworks
COMPOSE=docker-compose
DEV_CONTAINER=docker exec -it $(PROJECT_NAME)_backend

DOCKER_BAKE_FILE=$(shell test -f docker-bake.hcl && echo docker-bake.hcl)
BASE_IMAGE_EXISTS=$(shell docker image inspect makerworks-backend-base >/dev/null 2>&1 && echo 1 || echo 0)

# ✅ Detect host arch and avoid forcing --platform for Apple Silicon
HOST_ARCH := $(shell uname -m)
ifeq ($(HOST_ARCH),arm64)
  PLATFORM=
  BACKEND_DOCKERFILE=makerworks-backend/Dockerfile.macos
  MACOS_BUILD=true
else
  PLATFORM=linux/amd64
  BACKEND_DOCKERFILE=makerworks-backend/Dockerfile
  MACOS_BUILD=false
endif

export PLATFORM

.PHONY: up down restart logs build build-base fast-build fast-backend fast-frontend fast-worker fast-macos shell backend frontend db reset-db migrate revision upgrade downgrade seed prefetch clean-arch arch-status fix-arch

## 🔄 Remove wrong-arch images to avoid manifest mismatch
clean-arch:
	@echo "🧹 Checking for incorrect-arch images..."
	@for img in makerworks-backend:latest makerworks-worker:latest makerworks-backend-base makerworks-frontend:latest makerworks-frontend-prod:latest; do \
	  if docker image inspect $$img >/dev/null 2>&1; then \
	    img_arch=$$(docker image inspect $$img --format '{{.Architecture}}'); \
	    if [ "$(HOST_ARCH)" = "arm64" ] && [ "$$img_arch" != "arm64" ]; then \
	      echo "⚠️  Removing wrong-arch $$img ($$img_arch)"; \
	      docker rmi $$img || true; \
	      touch .arch_mismatch; \
	    fi; \
	  fi; \
	done

## 📊 Show image architectures
arch-status:
	@echo "📊 MakerWorks Image Architecture Status"
	@for img in makerworks-backend:latest makerworks-worker:latest makerworks-backend-base makerworks-frontend:latest makerworks-frontend-prod:latest; do \
	  if docker image inspect $$img >/dev/null 2>&1; then \
	    img_arch=$$(docker image inspect $$img --format '{{.Architecture}}'); \
	    printf "%-30s %s\n" "$$img" "$$img_arch"; \
	  else \
	    printf "%-30s NOT BUILT\n" "$$img"; \
	  fi; \
	done

## 🔧 Auto-fix architecture mismatches
fix-arch:
	@rm -f .arch_mismatch
	$(MAKE) clean-arch

## 🚀 Start all services (builds base if missing, native arch by default)
up: fix-arch
	@if [ "$(BASE_IMAGE_EXISTS)" = "0" ]; then \
	  echo "📦 Base image missing. Building makerworks-backend-base first..."; \
	  $(MAKE) build-base; \
	fi
	@echo "🔧 Building backend and worker (native arch if on M1/M2)"
	$(COMPOSE) build $(if $(PLATFORM),--build-arg TARGETPLATFORM=$(PLATFORM)) backend worker
	$(COMPOSE) up -d

## 🔁 Restart services
restart:
	$(MAKE) down
	$(MAKE) fix-arch
	@if [ "$(BASE_IMAGE_EXISTS)" = "0" ]; then \
	  echo "📦 Base image missing. Building makerworks-backend-base first..."; \
	  $(MAKE) build-base; \
	fi
	@echo "🔧 Building backend and worker (native arch if on M1/M2)"
	$(COMPOSE) build $(if $(PLATFORM),--build-arg TARGETPLATFORM=$(PLATFORM)) backend worker
	$(COMPOSE) up -d

## 🛑 Stop all services
down:
	$(COMPOSE) down

## 🏗️ Build base Python image (native arch on M1/M2)
build-base:
	@echo "📦 Building base Python image"
	docker buildx build \
		$(if $(PLATFORM),--platform $(PLATFORM)) \
		$(if $(PLATFORM),--build-arg TARGETPLATFORM=$(PLATFORM)) \
		--load \
		-t makerworks-backend-base \
		-f makerworks-backend/Dockerfile.base makerworks-backend

## ⚡ Fast build all
fast-build: fix-arch clean-arch
	@if [ "$(BASE_IMAGE_EXISTS)" = "0" ]; then $(MAKE) build-base; fi
	$(MAKE) fast-backend
	$(MAKE) fast-worker
	$(MAKE) fast-frontend

## ⚡ Fast build backend
fast-backend: fix-arch clean-arch
	@if [ "$(BASE_IMAGE_EXISTS)" = "0" ]; then $(MAKE) build-base; fi
	@echo "⚡ Building backend (native arch if on M1/M2)"
	docker buildx build \
		$(if $(PLATFORM),--platform $(PLATFORM)) \
		$(if $(PLATFORM),--build-arg TARGETPLATFORM=$(PLATFORM)) \
		-t makerworks-backend:latest \
		-f $(BACKEND_DOCKERFILE) makerworks-backend \
		--load

## ⚡ Fast build worker
fast-worker: fix-arch clean-arch
	@if [ "$(BASE_IMAGE_EXISTS)" = "0" ]; then $(MAKE) build-base; fi
	@echo "⚡ Building worker (native arch if on M1/M2)"
	docker buildx build \
		$(if $(PLATFORM),--platform $(PLATFORM)) \
		$(if $(PLATFORM),--build-arg TARGETPLATFORM=$(PLATFORM)) \
		-t makerworks-worker:latest \
		-f $(BACKEND_DOCKERFILE) makerworks-backend \
		--build-arg WORKER_IMAGE=true \
		--load

## ⚡ Fast build frontend
fast-frontend: fix-arch clean-arch
	@echo "⚡ Building frontend (native arch if on M1/M2)"
	$(COMPOSE) build $(if $(PLATFORM),--build-arg TARGETPLATFORM=$(PLATFORM)) frontend frontend-prod

logs:
	$(COMPOSE) logs -f backend frontend

shell:
	$(DEV_CONTAINER) /bin/bash

backend:
	$(DEV_CONTAINER) uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd makerworks-frontend && npm run dev

db:
	docker exec -it $(PROJECT_NAME)_postgres psql -U makerworks -d makerworks

reset-db:
	docker exec -it $(PROJECT_NAME)_postgres psql -U makerworks -d postgres -c "DROP DATABASE makerworks;"
	docker exec -it $(PROJECT_NAME)_postgres psql -U makerworks -d postgres -c "CREATE DATABASE makerworks;"
	$(DEV_CONTAINER) alembic upgrade head
	$(MAKE) seed

migrate:
	$(DEV_CONTAINER) alembic revision --autogenerate -m "auto migration"
	@echo "✅ Migration created. Run 'make upgrade'."

revision:
	$(DEV_CONTAINER) alembic revision -m "manual migration"
	@echo "✅ Blank migration created."

upgrade:
	$(DEV_CONTAINER) alembic upgrade head
	$(MAKE) seed

downgrade:
	$(DEV_CONTAINER) alembic downgrade -1

seed:
	@echo "🌱 Seeding database..."
	$(DEV_CONTAINER) python app/utils/seed_db.py
	@echo "✅ Database seeded."

prefetch:
	docker pull docker/dockerfile:1.5 &
	docker pull python:3.12-slim &
	wait
	@echo "✅ Prefetched base images."