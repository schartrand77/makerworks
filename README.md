# MakerWorks

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

MakerWorks is an open source 3D printing platform that pairs a Python backend with a modern React frontend. The project aims to make it easy to upload and preview 3D models, manage print jobs and estimate material costs, all through a web interface.

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Quick Start with Docker Compose](#quick-start-with-docker-compose)
- [Manual Setup](#manual-setup)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Contributing](#contributing)
- [Code of Conduct](#code-of-conduct)
- [Terms of Service](#terms-of-service)
- [Privacy Policy](#privacy-policy)
- [License](#license)

## Features
- **FastAPI backend** with Celery workers, Redis and PostgreSQL for robust background processing.
- **React 18 + Vite frontend** built with TypeScript and Tailwind CSS.
- **3D model processing** for uploading, STL metadata extraction and thumbnail rendering.
- **Authentication & profiles** with JWT auth, avatar uploads and admin dashboards.
- **Stripe payments** for secure checkout.
- **Prometheus metrics** and Grafana dashboards for monitoring.
- **End-to-end tests** powered by Cypress and unit tests using Vitest and Pytest.
- **Mobile clients** for iOS (SwiftUI) and Android (Jetpack Compose) with barcode scanning to add new filaments.

## Architecture
The repository is a monorepo containing both the API service and the web client:

- **Backend** – FastAPI application exposing REST endpoints and background workers.
- **Frontend** – React application communicating with the API and rendering the user interface.

Docker Compose can spin up the entire stack, including PostgreSQL, Redis, Prometheus and Grafana.

## Repository Structure
```
.
├─ makerworks-backend/   # FastAPI service with Celery workers, PostgreSQL and Redis integration
├─ makerworks-frontend/  # React + Vite application providing the web interface
├─ MakerWorks-iOS/       # SwiftUI client with barcode scanning
└─ MakerWorks-Android/   # Jetpack Compose client with visionOS-style glass UI and barcode scanning
```

## Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- Python 3.10+
- Node.js 18+

## Quick Start with Docker Compose
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

## Manual Setup
### Backend
```bash
cd makerworks-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt  # or `poetry install`
cp .env.example .env  # update values as needed
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend
```bash
cd makerworks-frontend
npm install
npm run dev
```
The app will be available at `http://localhost:5173` by default.

## Environment Variables
Each service includes a `.env.example` file listing all required variables. Copy it to `.env` and adjust values for your environment. Key settings include API URLs, database connection strings, Stripe keys and Redis configuration.

## Testing
Run the test suites before submitting changes:

```bash
# Backend tests
cd makerworks-backend
pytest

# Frontend tests
cd makerworks-frontend
npm test
```

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss the proposed improvements. Ensure `npm test`, `npm run lint` and `pytest` pass before submitting. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Code of Conduct
This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Terms of Service
Our [Terms of Service](docs/TERMS_OF_SERVICE.md) explain the rules and conditions for using MakerWorks.

## Privacy Policy
Our [Privacy Policy](docs/PRIVACY_POLICY.md) describes how we collect, store, and use your data and outlines your rights.

## License
MakerWorks is released under the [MIT License](makerworks-backend/LICENSE).
