# Environment Variables

**Last updated:** 2026-06-24

The platform is a monorepo with two independently-configured apps: the **backend**
(`backend/.env`, copy from `backend/.env.template`) and the **storefront**
(`storefront/.env.local`, copy from `storefront/.env.local.template`).

Most infrastructure providers are **optional** — the backend degrades gracefully:
no Redis → simulated/in-memory bus; no MinIO → local file storage; no MeiliSearch →
search disabled; payment/email providers activate only when their keys are present.

---

## 1. Backend (`backend/.env`)

### Core
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | no | `development` | Node environment. |
| `DATABASE_URL` | **yes** | `postgres://postgres:postgres@localhost:5432/medusa` | Postgres connection string. |
| `JWT_SECRET` | **yes** | `supersecret` | JWT signing secret — **change in production**. |
| `COOKIE_SECRET` | **yes** | `supersecret` | Cookie signing secret — **change in production**. |
| `REDIS_URL` | no | _(falls back to simulated redis)_ | Enables Redis event bus + Redis workflow engine. |
| `MEDUSA_WORKER_MODE` | no | `shared` | `shared` \| `server` \| `worker`. |
| `BACKEND_PUBLIC_URL` | prod | `http://localhost:9000` | Public backend URL (also read from `RAILWAY_PUBLIC_DOMAIN_VALUE`). Used to build the HitPay webhook URL. |
| `SHOULD_DISABLE_ADMIN` | no | — | Disable the bundled admin dashboard. |

### CORS
| Variable | Default |
|----------|---------|
| `ADMIN_CORS` | `http://localhost:7000,http://localhost:7001,https://docs.medusajs.com` |
| `STORE_CORS` | `http://localhost:8000,https://docs.medusajs.com` |
| `AUTH_CORS` | `http://localhost:7000,http://localhost:7001,https://docs.medusajs.com` |

### Admin bootstrap
| Variable | Default | Description |
|----------|---------|-------------|
| `MEDUSA_ADMIN_EMAIL` | `admin@yourmail.com` | Seeded admin user. |
| `MEDUSA_ADMIN_PASSWORD` | `supersecret` | Seeded admin password. |

### Storefront/redirect coupling
| Variable | Used by | Description |
|----------|---------|-------------|
| `STORE_URL` (or `MEDUSA_FRONTEND_URL`) | RinggitPay + HitPay `initiatePayment` | Public storefront URL; used to build payment **return/redirect** URLs. |

### Payments — Stripe (optional)
| Variable | Description |
|----------|-------------|
| `STRIPE_API_KEY` | Enables Stripe provider when set together with the webhook secret. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret. Capture is enabled. |

### Payments — RinggitPay (optional, Malaysia/SGD)
Provider activates when `RINGGITPAY_APP_ID` **and** `RINGGITPAY_REQUEST_KEY` are set.

| Variable | Required (for RinggitPay) | Description |
|----------|---------------------------|-------------|
| `RINGGITPAY_APP_ID` | yes | Merchant app id. |
| `RINGGITPAY_REQUEST_KEY` | yes | Key used to sign **outbound** request checksums. |
| `RINGGITPAY_RESPONSE_KEY` | no (defaults to request key) | Key used to verify **inbound** webhook checksums. |
| `RINGGITPAY_IS_SANDBOX` | no | `'true'` → sandbox host `ringgitpay.co`; else production `ringgitpay.com`. |

### Payments — HitPay (optional, Singapore/SGD)
| Variable | Required (for HitPay) | Description |
|----------|------------------------|-------------|
| `HITPAY_API_KEY` | yes | Sent as `X-BUSINESS-API-KEY`. Base URL: `https://api.hit-pay.com/v1`. |

> Note: the HitPay module reads `HITPAY_API_KEY` directly from `process.env` (it is
> not currently wired through `medusa-config.js` like RinggitPay). Set it in the env
> for the HitPay webhook + provider to function.

### Email — Resend (optional)
| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Enables the custom Resend notification provider. |
| `RESEND_FROM_EMAIL` (or `RESEND_FROM`) | From address. |

### Email — SendGrid (optional, alternative to Resend)
| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | Enables SendGrid notification provider. |
| `SENDGRID_FROM` / `SENDGRID_FROM_EMAIL` | From address. |

### File storage — MinIO (optional)
Set all three to switch from local storage to MinIO (auto-creates `medusa-media` bucket).

| Variable | Description |
|----------|-------------|
| `MINIO_ENDPOINT` | MinIO host. |
| `MINIO_ACCESS_KEY` | Access key. |
| `MINIO_SECRET_KEY` | Secret key. |
| `MINIO_BUCKET` | Optional, defaults to `medusa-media`. |

### Search — MeiliSearch (optional)
Set host + admin key to enable the `products` search index.

| Variable | Description |
|----------|-------------|
| `MEILISEARCH_HOST` | e.g. `http://localhost:7700`. |
| `MEILISEARCH_ADMIN_KEY` | Admin/API key for indexing. |
| `MEILISEARCH_MASTER_KEY` | Optional; used to fetch admin key if not set. |

---

## 2. Storefront (`storefront/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | **yes** | `http://localhost:9000` | Backend base URL the storefront calls. |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | **yes** | — | Publishable API key (can also be fetched via `/key-exchange`). |
| `NEXT_PUBLIC_BASE_URL` | yes | `http://localhost:8000` | Public storefront URL. |
| `NEXT_PUBLIC_DEFAULT_REGION` | no | `us` | Fallback region when IP geolocation fails. |
| `NEXT_PUBLIC_MEDUSA_FRONTEND_URL` | no | `http://localhost:8000` | Fallback base for RinggitPay callback redirects. |
| `NEXT_PUBLIC_MINIO_ENDPOINT` | no | — | MinIO host for image URLs (if used). |
| `NEXT_PUBLIC_SEARCH_ENDPOINT` | no | `http://localhost:7700` | MeiliSearch URL. |
| `NEXT_PUBLIC_SEARCH_API_KEY` | no | — | MeiliSearch search key. |
| `NEXT_PUBLIC_INDEX_NAME` | no | `products` | Search index name (must match backend). |

---

## 3. Minimal local setup

**Backend** (`backend/.env`):
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/medusa
JWT_SECRET=change-me
COOKIE_SECRET=change-me
STORE_URL=http://localhost:8000
# add a payment provider, e.g. RinggitPay sandbox:
RINGGITPAY_APP_ID=...
RINGGITPAY_REQUEST_KEY=...
RINGGITPAY_IS_SANDBOX=true
```

**Storefront** (`storefront/.env.local`):
```env
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEFAULT_REGION=my
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...
```

Then: `cd backend && pnpm install && pnpm ib && pnpm dev`, and in another shell
`cd storefront && pnpm install && pnpm dev`.

---

## 4. Production notes (Railway)
- `BACKEND_PUBLIC_URL` / `RAILWAY_PUBLIC_DOMAIN_VALUE` must resolve to the public backend domain — webhook URLs are derived from it.
- `STORE_URL` must be the public storefront domain — payment return URLs are derived from it.
- Always override `JWT_SECRET` and `COOKIE_SECRET`.
- Configure the payment providers' **dashboards** to point webhooks at the backend routes in `API.md` §Webhooks.
