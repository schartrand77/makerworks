# ------------------------
# Stage 1: Build frontend
# ------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (cached)
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# ------------------------
# Stage 2: Production container with static server
# ------------------------
FROM nginx:alpine AS production

WORKDIR /usr/share/nginx/html

# Copy built files from builder stage
COPY --from=builder /app/dist .

# Nginx config for SPA (serves index.html for all routes)
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ------------------------
# Stage 3: Dev mode (optional, for docker-compose override)
# ------------------------
FROM node:20-alpine AS dev

WORKDIR /app

# Install deps and start Vite dev server
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
