# MakerWorks

MakerWorks is an open source 3D printing platform combining a Python backend with a modern React frontend. This repository hosts both services so you can run the entire stack with a single command.

## Repository structure
- **makerworks-backend** – FastAPI service with Celery workers, PostgreSQL and Redis integration.
- **makerworks-frontend** – React + Vite application providing the web interface.

## Quick start with Docker Compose
1. Copy the environment files for each service:

   ```bash
   cp makerworks-backend/.env.example makerworks-backend/.env
   cp makerworks-frontend/.env.example makerworks-frontend/.env
   ```

2. Build and start all services:

   ```bash
   docker-compose up --build
   ```

   The API will be running at `http://localhost:8000` and the frontend at `http://localhost:5173`.

## Developing locally
See the [backend README](makerworks-backend/README.md) and [frontend README](makerworks-frontend/README.md) for detailed setup instructions, including how to run each project on its own.

## License
MakerWorks is released under the MIT License. Individual licenses can be found in the backend and frontend directories.
