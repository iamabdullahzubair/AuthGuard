# Production Dockerfile for AuthGuard Authenticator App
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies if needed for native modules
RUN apk add --no-cache python3 make g++

# Copy backend package files
COPY backend/package*.json ./backend/

# Install production dependencies
WORKDIR /usr/src/app/backend
RUN npm ci --only=production

# Final lightweight production image
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Copy node_modules from builder
COPY --from=builder /usr/src/app/backend/node_modules ./backend/node_modules

# Copy application source code
COPY backend ./backend
COPY pwa ./pwa
COPY website ./website

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /usr/src/app
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

WORKDIR /usr/src/app/backend
CMD ["node", "src/server.js"]
