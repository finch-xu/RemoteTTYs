# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-alpine AS build

# Build dependencies for better-sqlite3 (native addon)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/relay/package.json ./packages/relay/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY packages/web/ ./packages/web/
COPY packages/relay/ ./packages/relay/

# Build web (Vite) — also copies ghostty-vt.wasm to public/
RUN npm run build --workspace=web

# Copy web build output to relay's public directory
RUN rm -rf packages/relay/public && \
    cp -r packages/web/dist packages/relay/public

# Build relay (TypeScript → JavaScript)
RUN npm run build --workspace=@remotettys/relay

# Production-only dependencies in a clean directory
RUN mkdir /app/prod && \
    cp package.json package-lock.json /app/prod/ && \
    mkdir -p /app/prod/packages/web /app/prod/packages/relay && \
    cp packages/web/package.json /app/prod/packages/web/ && \
    cp packages/relay/package.json /app/prod/packages/relay/ && \
    cd /app/prod && npm ci --omit=dev && \
    mkdir -p /app/prod/packages/relay/node_modules

# ============================================================
# Stage 2: Runtime
# ============================================================
FROM node:22-alpine

WORKDIR /app

# Copy production node_modules
COPY --from=build /app/prod/node_modules ./node_modules
COPY --from=build /app/prod/packages/relay/node_modules ./packages/relay/node_modules

# Copy relay compiled JS and web assets
COPY --from=build /app/packages/relay/dist ./packages/relay/dist
COPY --from=build /app/packages/relay/public ./packages/relay/public
COPY --from=build /app/packages/relay/package.json ./packages/relay/

# Create non-root user for security
RUN addgroup -g 1001 -S rttys && adduser -S rttys -u 1001 -G rttys

# Create data directory for SQLite with proper ownership
RUN mkdir -p /app/data && chown -R rttys:rttys /app/data

ENV NODE_ENV=production
ENV PORT=8080
ENV RTTYS_DB=/app/data/relay.db

EXPOSE 8080

USER rttys

CMD ["node", "packages/relay/dist/index.js"]
