# syntax=docker/dockerfile:1
#
# Medusa 2.8.8 backend image.
# Build flow (pnpm build): `medusa build` -> .medusa/server, then postBuild.js
# copies the lockfile/.env into .medusa/server and runs `pnpm i --prod`.
# Runtime (pnpm start): `init-backend` migrates + seeds (idempotent) the DB,
# then `medusa start` serves the Store/Admin API on :9000.

############################
# Base
############################
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app

############################
# Dependencies (full — build needs devDeps like typescript/vite)
############################
FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

############################
# Build
############################
FROM deps AS build
COPY . .
# `medusa build` loads medusa-config.js, which asserts these vars exist. They are
# only needed to *load* the config at build time — no DB connection is made here.
# Real values are injected at runtime via the container environment.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    JWT_SECRET=build-time-placeholder \
    COOKIE_SECRET=build-time-placeholder
RUN pnpm build

############################
# Runtime
############################
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=9000
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
# The runtime needs the full app: init-backend runs migrations + `medusa exec`
# seed from src/, so we keep the source + node_modules + the built .medusa/server.
COPY --from=build /app ./
EXPOSE 9000
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=10 \
    CMD curl -fsS http://localhost:9000/health || exit 1
CMD ["pnpm", "start"]
