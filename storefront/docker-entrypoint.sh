#!/bin/sh
# Storefront entrypoint.
#
# Next.js inlines NEXT_PUBLIC_* at *build* time, and this project's launcher
# (`launch-storefront`) auto-fetches the publishable key from the backend's
# /key-exchange endpoint when NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is unset.
# Therefore we build at container start, once the backend is reachable, so the
# correct backend URL + publishable key are baked into the bundle.
#
# Set FORCE_REBUILD=true to rebuild on the next start (e.g. after changing any
# NEXT_PUBLIC_* value). A named volume on /app/.next keeps builds across restarts.
set -e

echo "[storefront] backend URL: ${NEXT_PUBLIC_MEDUSA_BACKEND_URL:-http://localhost:9000}"
echo "[storefront] waiting for backend /key-exchange to be ready..."
pnpm run wait || echo "[storefront] await-backend returned non-zero; continuing anyway"

# `next build` writes .next/BUILD_ID on success — use it as the "already built" sentinel.
if [ ! -f ".next/BUILD_ID" ] || [ "${FORCE_REBUILD:-false}" = "true" ]; then
  echo "[storefront] building Next.js app..."
  pnpm run build
else
  echo "[storefront] reusing existing .next build (set FORCE_REBUILD=true to force a rebuild)"
fi

echo "[storefront] starting Next.js on :${PORT:-8000}..."
exec pnpm run start
