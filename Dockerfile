# ==========================================
# 🐳 Mumble AI Production Dockerfile
# Lightweight, secure, multi-stage Alpine build
# ==========================================

FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3050

# Copy node modules and project files
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY server/ ./server/
COPY client/ ./client/
COPY scripts/ ./scripts/
COPY data/ ./data/

# Create uploads directory with appropriate permissions
RUN mkdir -p /app/uploads /app/data && chown -R node:node /app

# Run as non-root user for security
USER node

EXPOSE 3050

# Docker Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "server/index.js"]
