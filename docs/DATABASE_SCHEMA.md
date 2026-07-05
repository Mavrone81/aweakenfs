# Database Schema

**Datastore:** PostgreSQL (via MikroORM 6.4)
**ORM/Migrations:** Medusa core modules own their own tables and migrations.
**Last updated:** 2026-06-24

> This project does **not** define custom database entities. It runs on the
> standard MedusaJS 2.0 module data models. The customizations (RinggitPay /
> HitPay payment providers) persist their provider-specific state inside the
> **`payment_session.data`** JSONB column rather than in new tables.
>
> This document therefore describes (a) the Medusa core tables relevant to the
> checkout → payment → order flow this project extends, and (b) exactly what the
> custom providers store in JSON. To regenerate/inspect the full physical schema,
> run the Medusa migrations and inspect Postgres (`pnpm ib` seeds a fresh DB).

---

## 1. Entity Relationship Overview (relevant subset)

```
 customer ──┐
            │ 1
            ▼ *
          cart ───1:1──► payment_collection ───1:*──► payment_session ───(on capture)──► payment
            │ *                                            │
            │ 1:*                                          │ provider_id ∈ {stripe, ringgitpay, hitpay}
            ▼                                              │ data (JSONB) ← custom provider payload
        line_item                                          │
            │                                              │
            │  completeCartWorkflow                        │
            ▼                                              │
          order ──1:*──► order_line_item                   │
            │   ──1:1──► order_shipping_address            │
            │   ──1:1──► order_summary                     │
            └──1:*──► fulfillment / order_payment ◄────────┘

 product ──1:*──► product_variant ──*:*──► price
 region  ──1:*──► (currency, payment providers, shipping options)
 api_key (publishable "Webshop" key) ──► consumed by storefront via /key-exchange
```

---

## 2. Core tables (Medusa-managed) — fields that matter to this project

These are abbreviated views of Medusa's actual tables; only the columns this
system reads/writes in custom code are listed.

### `cart`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | prefixed `cart_…` — used as RinggitPay `orderId` reference |
| `email` | text (nullable) | guest checkout supported; email is optional |
| `currency_code` | text | `myr`, `sgd`, `usd`, … |
| `region_id` | text (FK → region) | |
| `completed_at` | timestamptz (nullable) | **idempotency guard** for cart completion |
| `payment_collection_id` | text (FK) | |

### `payment_collection`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | |
| `amount` | numeric | total to authorize/capture |
| `currency_code` | text | |
| `status` | text | |

### `payment_session`  ← **central to the custom integrations**
| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | prefixed `paysess_…` |
| `payment_collection_id` | text (FK) | |
| `provider_id` | text | `stripe` \| `ringgitpay` \| `hitpay` |
| `currency_code` | text | |
| `amount` | numeric | |
| `status` | text | `pending` \| `authorized` \| `captured` \| `canceled` |
| `data` | **jsonb** | **provider-specific payload — see §3** |

### `payment`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | created on capture |
| `payment_session_id` | text (FK) | |
| `amount` / `currency_code` | numeric / text | |
| `captured_at` / `canceled_at` | timestamptz | |

### `order` (+ children)
| Table | Key columns used here |
|-------|------------------------|
| `order` | `id`, `email`, `currency_code`, `created_at` |
| `order_line_item` | `order_id`, `title`, `quantity`, `unit_price` |
| `order_shipping_address` | retrieved in `order-placed` subscriber for the email |
| `order_summary` | totals rendered in the confirmation email |

### `product` family
Standard Medusa: `product`, `product_variant`, `product_option`, `product_category`,
`product_collection`, `price_set`, `price`. Indexed into MeiliSearch when configured.

### `api_key`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | |
| `title` | text | the `/key-exchange` route looks up the key titled **`Webshop`** |
| `token` | text | publishable key handed to the storefront |
| `type` | text | `publishable` |

### Auth / users
`user`, `auth_identity`, `invite` (the `invite.created` subscriber sends invite emails).

---

## 3. Custom provider payload stored in `payment_session.data` (JSONB)

The custom providers do not add tables; they serialize their state here.

### RinggitPay (`provider_id = 'ringgitpay'`)
Written by `initiatePayment()` (`backend/src/modules/ringgitpay/service.ts`):

```jsonc
{
  "appId":       "<RINGGITPAY_APP_ID>",
  "currency":    "MYR",                 // upper-cased
  "amount":      "100.00",              // 2-decimal string
  "orderId":     "cart_01J...",         // cart id used as merchant reference
  "checkSum":    "<SHA256 UPPERCASE>",  // sha256(appId|currency|amount|orderId|requestKey)
  "returnURL":   "<url-encoded storefront callback>",
  "buyerEmail":  "shopper@example.com",
  "accName":     "First Last",
  "payment_url": "https://ringgitpay.com/payment",  // or ringgitpay.co (sandbox)
  "session_id":  "paysess_..."
}
```

**Checksum verification (inbound webhook):**
`sha256( rp_appId | rp_currency | rp_amount | rp_statusCode | rp_orderId | rp_transactionRef | responseKey )`
must equal `rp_checkSum`.

**RinggitPay status codes:**
| Code | Meaning | Mapped action |
|------|---------|---------------|
| `RP00` | Success | `captured` |
| `RP09` | Pending | keep pending (`not_supported`) |
| `IR10`–`IR20`, `RP91`–`RP97` | Failure | `failed` → session `canceled` |

### HitPay (`provider_id = 'hitpay'`)
Written by `initiatePayment()` (`backend/src/modules/hitpay/service.ts`) — stores the
raw HitPay `payment-request` response plus a normalized `payment_url`:

```jsonc
{
  "id":          "<hitpay payment-request id>",
  "status":      "pending",
  "payment_url": "https://securecheckout.hit-pay.com/...",
  "amount":      "100.00",
  "currency":    "SGD",
  // ...full HitPay payment-request response spread in...
}
```

HitPay `metadata.session_id` (set at request time) is echoed back in the webhook and
used to locate the Medusa `payment_session`.

**HitPay event mapping:**
| `event_type` | Mapped action |
|--------------|---------------|
| `authorized_amount` | `authorized` |
| `success` | `captured` |
| other | `not_supported` |

---

## 4. Seeding / migrations

- `pnpm ib` (`init-backend`) — runs migrations + seeds a fresh database.
- `pnpm seed` — `medusa exec ./src/scripts/seed.ts` (regions, currencies, sample catalog).
- Migrations are owned by Medusa modules; there are no project-level custom migrations.
