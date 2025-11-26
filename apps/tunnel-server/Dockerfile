# LivePort Tunnel Server Dockerfile
# Multi-stage build for smaller production image

# Stage 1: Build
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/tunnel-server/package.json ./apps/tunnel-server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/tunnel-server ./apps/tunnel-server
COPY tsconfig.json ./

# Build
RUN pnpm --filter @liveport/shared build
RUN pnpm --filter @liveport/tunnel-server build

# Stage 2: Production
FROM node:20-alpine AS production

# Install pnpm for production deps
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/tunnel-server/package.json ./apps/tunnel-server/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/tunnel-server/dist ./apps/tunnel-server/dist

WORKDIR /app/apps/tunnel-server

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run
CMD ["node", "dist/index.mjs"]
