# MakerWorks Development Guide

MakerWorks uses **Docker Compose**, **BuildKit Bake**, and a dedicated backend base image to provide fast, reproducible development.

- ⚡ Minimal rebuild times  
- ✅ Consistent dependencies  
- 🖥️ Cross-platform support (Apple Silicon + Linux servers)

---

## 🚀 Quick Start

### 1️⃣ Build the backend base image
Run this once (or whenever `requirements.txt` changes):

```bash
make build-base

2️⃣ Start the dev stack with hot reload

docker compose up -d

	•	Backend mounts local code and runs uvicorn --reload.
	•	Worker mounts local code and reloads Celery tasks.
	•	Frontend runs Vite dev server with live reload.

3️⃣ Rebuild backend or worker when Dockerfile changes

make fast-backend
make fast-worker

🔄 Updating Dependencies

When you modify requirements.txt:

make build-base && make fast-backend && make fast-worker

	•	make build-base → Rebuilds the base image with new Python packages.
	•	make fast-backend / make fast-worker → Rebuilds runtime images on top of the updated base.

⸻

🛠️ Common Commands

🔥 Core Stack Commands
	•	make up → Runs fix-arch first, then starts all services with docker-compose up -d.
	•	make down → Stops all services with docker-compose down.
	•	make restart → Stops everything, runs fix-arch, rebuilds if any images were removed (auto fast-build / fast-macos), then starts the stack again.
	•	make logs → Tails logs for backend and frontend.

⸻

🏗️ Build Commands
	•	make build-base → Builds the base Python image (makerworks-backend-base) for the detected platform.
	•	make fast-build → Runs fix-arch, cleans wrong-arch images, builds all services. On Apple Silicon, auto-redirects to fast-macos.
	•	make fast-backend → Runs fix-arch and rebuilds the backend only (using the correct Dockerfile for macOS or Linux).
	•	make fast-worker → Runs fix-arch and rebuilds the Celery worker only.
	•	make fast-frontend → Runs fix-arch and rebuilds the frontend and frontend-prod images.
	•	make fast-macos → Runs fix-arch and builds macOS-native backend and worker images explicitly.

⸻

🔍 Architecture Management
	•	make arch-status → Shows all MakerWorks images with color-coded architecture status (✅ green = correct, ❌ red = mismatch, ⚠️ yellow = not built).
	•	make fix-arch → Checks all images against $(PLATFORM), removes mismatched ones, sets .arch_mismatch flag if any were cleaned.
	•	make clean-arch → Directly deletes any wrong-arch images without checking.

⸻

💻 Dev Utilities
	•	make shell → Opens a shell into the backend container.
	•	make backend → Runs backend server (Uvicorn) inside the container with reload.
	•	make frontend → Starts the local frontend in dev mode (npm run dev).

⸻

🗄️ Database Commands
	•	make db → Opens a psql shell into the database.
	•	make reset-db → Drops and recreates the database, runs migrations, seeds it.
	•	make migrate → Creates an auto-generated Alembic migration.
	•	make revision → Creates a blank Alembic migration.
	•	make upgrade → Applies all migrations and seeds the DB.
	•	make downgrade → Rolls back the last migration.
	•	make seed → Runs seed_db.py inside the backend container.

⸻

⚡ Performance
	•	make prefetch → Pre-downloads base images (docker/dockerfile and python:3.12-slim) for faster builds.

⸻

✅ Key Behaviors in Place
	•	Every fast-* build command auto-runs fix-arch to ensure image/platform consistency.
	•	make up and make restart validate architectures before running.
	•	make restart auto-rebuilds backend/worker if any images were removed by fix-arch.

⸻


📌 Daily Workflow

Start the stack and use hot reload for code changes:

docker compose up -d

When you update Dockerfiles (backend or worker):

make fast-backend && make fast-worker

When you change dependencies (requirements.txt):

make build-base && make fast-backend && make fast-worker

