# syntax=docker/dockerfile:1.5

###
# 1. Install frontend deps with cache mount
###
FROM node:20-alpine AS deps
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/app/node_modules \
    set -eux; \
    npm config set fund false; \
    npm config set audit false; \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi; \
    cp -R /app/node_modules /tmp/node_modules

###
# 2. Build app
###
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /tmp/node_modules ./node_modules
COPY frontend/package*.json ./
COPY frontend/. .

# Optional env fallback for Vite build
COPY frontend/.env.dev .env || true

RUN --mount=type=cache,target=/app/.vite \
    npm run build

###
# 3. Serve via nginx
###
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# Copy built files
COPY --from=builder /app/dist ./

# Ensure nginx config dir exists and remove default if present
RUN mkdir -p /etc/nginx/conf.d && rm -f /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

###
# 4. Dev container for Vite HMR
###
FROM node:20-alpine AS dev
WORKDIR /app

COPY --from=deps /tmp/node_modules ./node_modules
COPY frontend/package*.json ./
COPY frontend/. .

COPY frontend/.env.development .env || true

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]