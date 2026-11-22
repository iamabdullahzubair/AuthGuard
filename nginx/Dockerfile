# ==============================================================================
# Multi-Stage Production Build for AuthGuard Frontend & Nginx
# ==============================================================================

# Stage 1: Build Next.js Static Export
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy dependency files
COPY frontend/package*.json ./

# Install dependencies cleanly
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# Build and export static assets (outputs to /app/out)
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Lightweight Production Nginx Server
FROM nginx:1.27-alpine

# Set up dashboard directory
WORKDIR /var/www/dashboard

# Copy compiled static assets directly from builder stage
COPY --from=frontend-builder /app/out /var/www/dashboard

# Copy default nginx configuration as fallback
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/conf.d /etc/nginx/conf.d

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
