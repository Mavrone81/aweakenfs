# syntax=docker/dockerfile:1
#
# Next.js storefront image — immutable variant (see docs/DOCKER.md "Immutable
# storefront image"): NEXT_PUBLIC_* values are passed as build args and the
# production build is baked into the image at build time, so container start is
# instant (no runtime `next build`). Requires the publishable key up front —
# prod pins NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY in .env, so this holds.
# The entrypoint's BUILD_ID sentinel keeps working: it finds the baked build
# and skips straight to `next start`.

############################
# Base
############################
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app

############################
# Dependencies (devDeps included — needed by `next build`)
############################
FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

############################
# App (build baked at image build time; entrypoint skips to `next start`)
############################
FROM deps AS app
ENV NODE_ENV=production \
    PORT=8000
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN cp docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

# NEXT_PUBLIC_* are inlined into the browser bundle by `next build` — they must
# be present now, not just at runtime. Values arrive as build args from the
# compose file (docker-compose.lite.prod.yml storefront.build.args).
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_DEFAULT_REGION
ARG NEXT_PUBLIC_MINIO_ENDPOINT
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_DEFAULT_REGION=$NEXT_PUBLIC_DEFAULT_REGION \
    NEXT_PUBLIC_MINIO_ENDPOINT=$NEXT_PUBLIC_MINIO_ENDPOINT
RUN pnpm run build:next

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=10 \
    CMD curl -fsS http://localhost:8000/api/healthcheck || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
