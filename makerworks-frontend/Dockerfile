# syntax=docker/dockerfile:1.5

############################
# Stage: deps (install)
############################
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./

# Cache npm + node_modules between builds
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/app/node_modules \
    set -eux; \
    npm config set fund false; \
    npm config set audit false; \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi; \
    cp -R /app/node_modules /tmp/node_modules

############################
# Stage: builder
############################
FROM node:20-alpine AS builder
WORKDIR /app

# ---- Version: belt & suspenders ----
# Build-arg can be overridden by CI: --build-arg APP_VERSION=$(git describe --tags --always)
ARG APP_VERSION=dev
# Make version available to Vite at build time
ENV APP_VERSION=${APP_VERSION}
ENV VITE_APP_VERSION=${APP_VERSION}

# Bring in deps
COPY --from=deps /tmp/node_modules ./node_modules
COPY package*.json ./
COPY . .

# Ensure there is always a VERSION file for vite.config.ts to read
# If repo didn't include one, synthesize it from APP_VERSION.
RUN set -eux; \
    if [ -f VERSION ]; then \
      ver="$(cat VERSION | tr -d '\n\r')"; \
      if [ -n "$ver" ]; then echo "Using VERSION file: $ver"; else echo "${APP_VERSION}" > VERSION; fi; \
    else \
      echo "${APP_VERSION}" > VERSION; \
    fi

# ---- Env handling for Vite build ----
# Prefer .env.production → .env, else fall back sensibly.
# Vite will read ".env" and mode-specific files; we normalize to ".env"
RUN set -eux; \
    if [ -f .env.production ]; then cp .env.production .env; \
    elif [ -f .env.prod ]; then cp .env.prod .env; \
    elif [ -f .env ]; then :; \
    elif [ -f .env.dev ]; then cp .env.dev .env; \
    else touch .env; fi

# Cache Vite cache to speed rebuilds
RUN --mount=type=cache,target=/app/.vite \
    npm run build

############################
# Stage: production (nginx)
############################
FROM nginx:alpine AS production

# Ensure conf.d exists and remove default if present
RUN mkdir -p /etc/nginx/conf.d && rm -f /etc/nginx/conf.d/default.conf

# DO NOT replace /etc/nginx/nginx.conf — it includes mime.types.
# Only drop in our site/server config (server block).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist/ ./

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

############################
# Stage: dev (Vite)
############################
FROM node:20-alpine AS dev
WORKDIR /app

# ---- Version: belt & suspenders (runtime) ----
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
# Vite only exposes vars prefixed with VITE_ to the client
ENV VITE_APP_VERSION=${APP_VERSION}

# Helpful file watching defaults for Docker on macOS/Windows
ENV CHOKIDAR_USEPOLLING=1

COPY --from=deps /tmp/node_modules ./node_modules
COPY package*.json ./
COPY . .

# Ensure VERSION exists for vite.config.ts in dev too
RUN set -eux; \
    if [ -f VERSION ]; then \
      ver="$(cat VERSION | tr -d '\n\r')"; \
      if [ -z "$ver" ]; then echo "${APP_VERSION}" > VERSION; fi; \
    else \
      echo "${APP_VERSION}" > VERSION; \
    fi

# Dev env is optional; don't crash if missing.
# Vite reads .env.local/.env.development too, but this keeps parity.
RUN if [ -f .env.dev ]; then cp .env.dev .env || true; fi

EXPOSE 5173
# --host binds on 0.0.0.0 for Docker; leave HMR defaults to Vite
CMD ["npm", "run", "dev", "--", "--host"]
