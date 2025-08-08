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

# Bring in deps
COPY --from=deps /tmp/node_modules ./node_modules
COPY package*.json ./
COPY . .

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

COPY --from=deps /tmp/node_modules ./node_modules
COPY package*.json ./
COPY . .

# Dev env is optional; don't crash if missing.
# Vite reads .env.local/.env.development too, but this keeps parity.
RUN if [ -f .env.dev ]; then cp .env.dev .env || true; fi

EXPOSE 5173
# --host binds on 0.0.0.0 for Docker; leave HMR defaults to Vite
CMD ["npm", "run", "dev", "--", "--host"]
