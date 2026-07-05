# Lite Backend

A lightweight, **Medusa-v2-API-compatible** backend (Express + SQLite) that drives the
existing Next.js storefront **unmodified**, plus a small custom admin UI. It replaces the
heavy `backend/` (full MedusaJS + Postgres + Redis) for development and small deployments.

- **No Postgres, no Redis** — a single `data.db` SQLite file.
- **Drop-in for the storefront** — implements the exact Store/Auth endpoints and JSON
  shapes the storefront's `@medusajs/js-sdk` consumes.
- **RinggitPay** payment provider (initiate session + webhook → order).
- **Minimal admin** at `/app` to manage products, prices, regions, payment modes & shipping.

## Quick start

```bash
cd backend-lite
npm install
npm run seed     # creates data.db with demo regions, products, shipping, admin user
npm run dev      # http://localhost:9000  (admin at http://localhost:9000/app)
```

Then point the storefront at it (already done in `storefront/.env.local`):

```
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_lite_storefront_key
```

```bash
cd ../storefront && npm install && npm run dev   # http://localhost:8000
```

## Scripts

| Script           | Purpose                                              |
|------------------|------------------------------------------------------|
| `npm run dev`    | Start with watch/reload (tsx)                        |
| `npm start`      | Start once (tsx)                                      |
| `npm run seed`   | (Re)seed the database (clears + inserts demo data)   |
| `npm run reset`  | Delete `data.db` and reseed from scratch             |
| `npm run build`  | Type-check & compile to `dist/`                      |
| `npm run serve`  | Run the compiled `dist/server.js`                    |

## Admin

Open `http://localhost:9000/app` and sign in with `admin@example.com` / `supersecret`
(override via `ADMIN_EMAIL` / `ADMIN_PASSWORD`, applied on `seed`). You can manage:

- **Products** — details, status, collection, variants, per-currency **prices**, stock.
- **Regions & Payments** — name, currency, countries, and which **payment modes**
  (RinggitPay / Manual) are enabled per region.
- **Shipping** — flat-rate shipping options per region.
- **Orders** — view placed orders.

## Implemented API surface

**Store** (`/store/*`): `regions`, `products`, `collections`, `product-categories`,
`carts` (+ line-items, shipping-methods, complete), `shipping-options`,
`payment-providers`, `payment-collections` (+ payment-sessions), `orders`,
`customers/me` (+ addresses).
**Auth** (`/auth/*`): `customer`/`user` `emailpass` register + login, `session` logout (JWT).
**Custom**: `GET /key-exchange`, `POST /api/webhooks/ringgitpay`.
**Admin** (`/admin/*`, JWT user token): products/variants/prices, regions + payment
providers + countries, shipping-options, orders, collections, categories.

## RinggitPay flow

1. Storefront checkout calls `initiatePaymentSession(cart, { provider_id: "pp_ringgitpay_ringgitpay" })`.
2. Backend stores a session whose `data` holds `{ payment_url, appId, currency, amount,
   orderId, checkSum, returnURL, buyerEmail, accName }`.
3. The storefront's RinggitPay button POSTs that form to the gateway.
4. RinggitPay calls `POST /api/webhooks/ringgitpay`; the backend verifies the SHA-256
   checksum, marks the session captured, and completes the cart → **creates the order**.

Set real `RINGGITPAY_*` env values for live payments. Amounts are major units (e.g. `19.99`).

## Notes / scope

- Taxes, discounts/promotions and gift cards are returned as `0` (fields exist for
  storefront compatibility but aren't computed).
- Inventory is tracked but not decremented on order (kept simple).
- Single-node only (SQLite, in-process). For production scale, use the full `backend/`.
