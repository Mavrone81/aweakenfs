# syntax=docker/dockerfile:1
#
# Lightweight backend image (Express + SQLite, Medusa-v2-API-compatible).
# Runs the TypeScript source directly with tsx — no build step, no Postgres/Redis.
# The SQLite database lives in /app/data (mounted as a volume) and is seeded on
# first boot by docker-entrypoint.sh.

FROM node:22-slim AS base
WORKDIR /app

# Toolchain for better-sqlite3's native build + curl for the healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Install ALL deps (tsx/typescript are devDeps but are the runtime — see
# package.json "start": "tsx src/server.ts"). NODE_ENV is set *after* install so
# devDependencies are not skipped.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production \
    PORT=9000 \
    DB_PATH=/app/data/data.db

RUN cp docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 9000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD curl -fsS http://localhost:9000/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
