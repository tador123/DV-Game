# ============================================================
# 🧛 DARK SURVIVORS — Dockerfile
# Multi-stage build for small, secure production image
# ============================================================

# ---------- Stage 1: Install dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Stage 2: Production image ----------
FROM node:20-alpine
LABEL maintainer="dark-survivors"
LABEL description="Dark Survivors — Vampire Survivors-style survival game"

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy dependencies from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY package.json ./
COPY server.js ./
COPY public/ ./public/

# Create data directory and give ownership to non-root user
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# data.json is stored in /app/data so it can be volume-mounted
ENV DATA_DIR=/app/data
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
