# Docker Deployment

This project ships a Docker setup for the full monorepo:

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Medusa 2.8.8 backend image (Node 22 + pnpm 9) |
| `storefront/Dockerfile` | Next.js storefront image |
| `storefront/docker-entrypoint.sh` | Builds the storefront against the running backend, then starts it |
| `docker-compose.yml` | Orchestrates postgres, redis, backend, storefront (+ optional minio, meilisearch) |
| `.env.docker.example` | Template for all compose variables |
| `backend/.dockerignore`, `storefront/.dockerignore` | Keep build contexts small |

---

## Quick start

```bash
cp .env.docker.example .env
# edit .env — at minimum set JWT_SECRET and COOKIE_SECRET
docker compose up -d --build
```

Then:
- **Storefront:** http://localhost:8000
- **Admin dashboard:** http://localhost:9000/app (login with `MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD`)
- **Store/Admin API:** http://localhost:9000

What happens on first `up`:
1. `postgres` and `redis` start and become healthy.
2. `backend` runs `init-backend` → **migrates + seeds** the database (creates the
   admin user, a default region/sales-channel, sample catalog, and the **`Webshop`
   publishable key**), then serves the API. Seeding is **idempotent** — it is
   skipped on subsequent boots.
3. `storefront` waits for the backend's `/key-exchange`, **auto-fetches the
   publishable key**, runs `next build`, and starts on :8000.

> First storefront boot includes a full Next.js build, so it can take a few
> minutes. The build is cached in the `storefront-next` volume; restarts are fast.
> Set `FORCE_REBUILD=true` to rebuild after changing any `NEXT_PUBLIC_*` value.

### With MinIO + MeiliSearch

```bash
docker compose --profile full up -d --build
```
Then set the corresponding vars in `.env` (`MINIO_ENDPOINT`, `MEILISEARCH_HOST`,
`MEILISEARCH_ADMIN_KEY`, `NEXT_PUBLIC_SEARCH_*`) so the apps actually use them —
the services are wired but the apps only enable them when their env vars are set.

---

## Networking: the one thing to get right

`NEXT_PUBLIC_MEDUSA_BACKEND_URL` is special. Next.js **inlines it into the browser
bundle at build time**, and the storefront also uses it **server-side** (SSR,
region middleware, the publishable-key fetch). So it must point at a URL that is
reachable from **both the shopper's browser and the storefront container**.

- **Production (recommended):** set it to your **public API domain**, e.g.
  `https://api.yourstore.com`. A public domain resolves from everywhere, so there
  is no split — this is the clean, correct setup. Put the storefront and backend
  behind a reverse proxy (Caddy/Nginx/Traefik) terminating TLS.

- **Local single host:** the default `http://localhost:9000` works for the
  **browser** (backend is published on host port 9000) but **not** for server-side
  calls from inside the storefront container (its own `localhost` has no backend).
  Two ways to make local SSR fully correct:
  1. Add `127.0.0.1 backend` to your host's `/etc/hosts`, then set
     `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://backend:9000` in `.env`. Now `backend`
     resolves to the container (via compose DNS) *and* to the published host port
     (via your hosts file) — both sides agree. Update the CORS vars to match.
  2. Or just use your machine's LAN IP / a real domain that resolves both places.

The provided defaults prioritize a working browser experience out of the box; for
production, always switch to a public domain.

---

## Common operations

```bash
docker compose logs -f backend          # follow backend logs
docker compose logs -f storefront       # follow storefront (incl. build) logs
docker compose ps                       # service status / health
docker compose exec backend pnpm seed   # re-run the seed manually
docker compose exec postgres psql -U postgres -d medusa   # psql shell
docker compose down                     # stop (keeps volumes/data)
docker compose down -v                  # stop AND delete all data volumes
docker compose up -d --build backend    # rebuild + restart just the backend
FORCE_REBUILD=true docker compose up -d storefront   # force a storefront rebuild
```

Get the publishable key (e.g. to pin it in `.env`):
```bash
curl -s http://localhost:9000/key-exchange
```

---

## Production notes

- **Secrets:** set strong `JWT_SECRET` / `COOKIE_SECRET`. Provide payment/email
  keys via your orchestrator's secret store, not the committed `.env`.
  **Rotate any key that has ever been shared in plaintext.**
- **Worker mode:** for horizontal scaling, run a second backend with
  `MEDUSA_WORKER_MODE=worker` and the web one with `MEDUSA_WORKER_MODE=server`
  (both need the shared `REDIS_URL`). Seeding is skipped in worker mode.
- **Webhooks:** point the payment providers' dashboards at your public backend:
  - RinggitPay → `https://<api-domain>/api/webhooks/ringgitpay`
  - HitPay → `https://<api-domain>/webhooks/hitpay`
  - Stripe → the standard Medusa Stripe webhook endpoint
  (See `docs/API.md`.)
- **Immutable storefront image (optional):** to bake the build into the image
  instead of building at container start, add build args to `storefront/Dockerfile`
  and call `next build` during the image build:
  ```dockerfile
  ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
  ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY   # obtain from /key-exchange first
  ARG NEXT_PUBLIC_BASE_URL
  ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
      NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
  RUN pnpm run build:next
  ```
  This requires the publishable key up front (a one-time bootstrap: start the
  backend, read `/key-exchange`, then build the storefront image with that key).

---

## Image design notes

- **Base:** `node:22-slim` (Debian) for broad native-module compatibility; pnpm via corepack.
- **Backend** keeps source + full `node_modules` in the runtime image because
  `init-backend` runs migrations and `medusa exec` seeding from `src/` at boot.
- **Storefront** builds at container start (`docker-entrypoint.sh`) so the launcher
  can auto-fetch the publishable key and bake the correct `NEXT_PUBLIC_*` values.
- **Healthchecks:** backend `GET /health`, storefront `GET /api/healthcheck`.
- **Persistent volumes:** `postgres-data`, `redis-data`, `backend-uploads`
  (local media when MinIO is off), `storefront-next` (build cache), plus
  `minio-data` / `meili-data` under the `full` profile.
