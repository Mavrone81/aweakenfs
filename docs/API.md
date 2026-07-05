# API Documentation

**Last updated:** 2026-06-24

The backend exposes the full **MedusaJS 2.0 Store and Admin REST APIs** plus a small
set of **custom routes** added by this project. This document focuses on the custom
routes and the payment webhooks; for the exhaustive Store/Admin surface, see the
official Medusa API reference (https://docs.medusajs.com/api).

- **Backend base URL:** `BACKEND_PUBLIC_URL` (default `http://localhost:9000`)
- **Storefront base URL:** `NEXT_PUBLIC_BASE_URL` (default `http://localhost:8000`)
- **Auth:** Store API requires the `x-publishable-api-key` header; Admin API requires a session/JWT. Webhooks are unauthenticated but signature/checksum-verified.

---

## 1. Standard Medusa APIs (reused, not exhaustive)

| Group | Prefix | Examples |
|-------|--------|----------|
| Store | `/store/*` | `GET /store/products`, `POST /store/carts`, `POST /store/carts/:id/line-items`, `POST /store/carts/:id/payment-collections`, `POST /store/payment-collections/:id/payment-sessions`, `POST /store/carts/:id/complete` |
| Admin | `/admin/*` | products, orders, regions, fulfillments, users, invites |
| Auth | `/auth/*` | customer & user authentication |

The custom payment providers (`stripe`, `ringgitpay`, `hitpay`) appear as selectable
providers on a region and are driven through the **standard** payment-session endpoints
above — there is no custom "initiate payment" HTTP route; initiation happens inside the
provider's `initiatePayment()` when a payment session is created.

---

## 2. Custom backend routes

### 2.1 `GET /key-exchange`
Returns the storefront's publishable API key (the API key titled **`Webshop`**).
Source: `backend/src/api/key-exchange/route.ts`.

**Request:** `GET /key-exchange`

**Response 200**
```json
{ "publishableApiKey": "pk_01J..." }
```
Returns `{}` if no `Webshop` key exists; `500` on error.

---

### 2.2 `GET /store/custom` and `GET /admin/custom`
Scaffolding/example routes (`backend/src/api/store/custom/route.ts`,
`backend/src/api/admin/custom/route.ts`). Present as extension points; not part of the
payment flow.

---

## 3. Payment webhooks (custom)

These are **server-to-server** callbacks from the payment providers. Each verifies the
payload, maps it to a Medusa payment-session status, updates the session, and (on
success) completes the cart to create the order.

### 3.1 RinggitPay webhook — `POST /api/webhooks/ringgitpay`
Route file: `backend/src/api/api/webhooks/ringgitpay/route.ts`
(Medusa file-based routing: `src/api/api/webhooks/ringgitpay` → `/api/webhooks/ringgitpay`.)

**Content-Type:** form/JSON body of RinggitPay response fields.

**Request body fields**
| Field | Description |
|-------|-------------|
| `rp_appId` | Merchant app id. |
| `rp_currency` | `MYR` / `SGD`. |
| `rp_amount` | Amount (decimal string). |
| `rp_statusCode` | `RP00` success, `RP09` pending, `IR10`–`IR20`/`RP91`–`RP97` failure. |
| `rp_orderId` | Reference id — the **cart id** (`cart_…`) or session id. |
| `rp_transactionRef` | RinggitPay transaction reference. |
| `rp_checkSum` | `SHA-256` checksum to verify (see DATABASE_SCHEMA §3). |

**Processing**
1. Verify checksum: `sha256(rp_appId|rp_currency|rp_amount|rp_statusCode|rp_orderId|rp_transactionRef|responseKey)` (uppercase) must equal `rp_checkSum`. Mismatch → `failed`.
2. Map status: `RP00` → captured, `RP09` → keep pending, else canceled.
3. Resolve the Medusa payment session:
   - `rp_orderId` starting `cart_…` → look up the cart's `ringgitpay` payment session.
   - starting `paysess_…` → use directly.
4. `updatePaymentSession({ id, status, amount, data })`.
5. If captured/authorized and the cart isn't already completed → run `completeCartWorkflow` to create the order.

**Response**
```json
{ "received": true }   // 200 — always acknowledged (even when skipped)
```
`500 { "error": "..." }` on unexpected error.

---

### 3.2 HitPay webhook — `POST /webhooks/hitpay`
Route file: `backend/src/api/webhooks/hitpay/route.ts` → `/webhooks/hitpay`.

**Request body fields**
| Field | Description |
|-------|-------------|
| `event_type` | `authorized_amount` → authorized, `success` → captured, else ignored. |
| `amount` | Amount. |
| `metadata.session_id` | Medusa payment-session id (set at request time). |

**Processing**
1. Map `event_type` → action/status.
2. If no `session_id` → ack and skip.
3. `retrievePaymentSession(session_id)` then `updatePaymentSession({ id, status, amount, data })`.

**Response**
```json
{ "received": true }   // 200
```
`500 { "error": "..." }` on error.

> Note: unlike RinggitPay, the HitPay handler does not currently complete the cart
> itself and does not verify an HMAC signature (see PRD Risks R-2).

---

### 3.3 Stripe webhook
Handled by the stock `@medusajs/payment-stripe` provider (configured in
`medusa-config.js`), verified with `STRIPE_WEBHOOK_SECRET`. Point Stripe at the
provider's standard Medusa webhook endpoint.

---

## 4. Storefront route — RinggitPay browser return

### `POST /api/ringgitpay/callback`  (Next.js storefront)
Route file: `storefront/src/app/api/ringgitpay/callback/route.ts`

RinggitPay performs a **form-POST redirect of the shopper's browser** back to this URL
(`returnURL` built during `initiatePayment`, with `?countryCode=&cart_id=`). This route
parses the form fields and 303-redirects the shopper to a user-facing page:

| Outcome (`rp_statusCode`) | Redirect target |
|---------------------------|-----------------|
| `RP00` (success) | `/{countryCode}/ringgitpay/success?transactionId=&orderId=&amount=` |
| anything else | `/{countryCode}/ringgitpay/failed?reason=&statusCode=&transactionId=&orderId=` |
| error/fallback | `/my/checkout` |

This browser return is **for UX only**; the authoritative order creation happens via
the server-to-server webhook in §3.1.

---

## 5. Healthcheck
`GET /api/healthcheck` (storefront) — `storefront/src/app/api/healthcheck`.

---

## 6. Quick reference

| Method | Path | App | Purpose |
|--------|------|-----|---------|
| `GET` | `/key-exchange` | backend | Fetch publishable API key |
| `POST` | `/api/webhooks/ringgitpay` | backend | RinggitPay payment webhook (verify + complete cart) |
| `POST` | `/webhooks/hitpay` | backend | HitPay payment webhook (verify + update session) |
| `POST` | `/api/ringgitpay/callback` | storefront | RinggitPay browser return → success/fail page |
| `GET` | `/store/*`, `/admin/*` | backend | Standard Medusa commerce API |
