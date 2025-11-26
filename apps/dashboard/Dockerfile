# LivePort Dashboard Dockerfile
# Multi-stage build for Next.js standalone output

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/dashboard/package.json ./apps/dashboard/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
RUN npm install -g pnpm

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules

# Copy source
COPY . .

# Build shared package first
RUN pnpm --filter @liveport/shared build

# Build dashboard with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @liveport/dashboard build

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
