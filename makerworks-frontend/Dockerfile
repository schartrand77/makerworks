# syntax=docker/dockerfile:1.5

# -----------------------------
# Stage: deps
# -----------------------------
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/app/node_modules \
    set -eux; \
    npm config set fund false; \
    npm config set audit false; \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi; \
    cp -R /app/node_modules /tmp/node_modules

RUN mv /tmp/node_modules /app/node_modules

# -----------------------------
# Stage: builder
# -----------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY . .

# ✅ Use correct env file
COPY .env.dev /app/.env.dev
RUN test -f /app/.env.dev || touch /app/.env.dev

RUN --mount=type=cache,target=/app/.vite npm run build

# -----------------------------
# Stage: production
# -----------------------------
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

COPY --from=builder /app/dist .

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# -----------------------------
# Stage: dev (hot reload)
# -----------------------------
FROM node:20-alpine AS dev
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY . .

# ✅ Use correct env file here too
COPY .env.dev /app/.env.dev
RUN test -f /app/.env.dev || touch /app/.env.dev

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
