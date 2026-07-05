# Product Requirements Document (PRD)

**Project:** EcommerceV2 — Headless Commerce Platform with Multi-Gateway Payments
**Stack:** MedusaJS 2.8.8 (backend) + Next.js 14/15 (storefront)
**Status:** Living document
**Last updated:** 2026-06-24

---

## 1. Overview

EcommerceV2 is a headless e-commerce platform built on a MedusaJS 2.0 monorepo
(backend + storefront). It is a deployable, production-shaped boilerplate that has
been extended with **custom payment-gateway integrations for the Southeast Asian
market** — specifically **RinggitPay** (Malaysia) and **HitPay** (Singapore) — in
addition to the stock **Stripe** provider.

The platform separates a customer-facing storefront (Next.js) from a headless
commerce backend (Medusa) that exposes Store and Admin REST APIs, an admin
dashboard, and a payment/notification/search/file infrastructure layer.

### What makes this system different from stock Medusa

| Area | Customization |
|------|---------------|
| Payments | Two bespoke payment providers — `ringgitpay` and `hitpay` — implementing Medusa's `AbstractPaymentProvider` |
| Webhooks | Custom backend webhook routes that verify provider signatures and drive cart completion |
| Storefront callback | A Next.js API route that intercepts RinggitPay's form-POST return and routes the shopper to success/failure pages |
| Currency/region | First-class support for **MYR** and **SGD** with country-code-aware redirects |

---

## 2. Goals & Non-Goals

### Goals
- G1. Let customers browse products, build a cart, and check out as guest or registered user.
- G2. Accept payments through **Stripe**, **RinggitPay**, and **HitPay**, selectable per region/currency.
- G3. Verify payment authenticity (checksum/event verification) before creating an order.
- G4. Automatically convert a paid cart into an order and email the customer a confirmation.
- G5. Provide an admin dashboard for catalog, order, inventory, and fulfillment management.
- G6. Be deployable to Railway with optional Redis, MinIO, and MeiliSearch, degrading gracefully when they are absent.

### Non-Goals
- N1. Building a custom checkout/admin UI from scratch (Medusa's storefront + dashboard are reused).
- N2. Custom inventory/tax/promotions engines (Medusa core modules are used as-is).
- N3. Refund automation for RinggitPay/HitPay (current providers no-op these calls — see Risks).
- N4. Multi-tenant / marketplace functionality.

---

## 3. Personas

- **Shopper (guest or registered):** browses, adds to cart, checks out, pays, tracks orders.
- **Store operator / Admin:** manages products, prices, regions, inventory, orders, fulfillment via the Medusa Admin dashboard.
- **Payment provider (system actor):** RinggitPay / HitPay / Stripe — issue redirects and send webhooks.
- **Developer / Operator:** configures environment, deploys, monitors webhook logs.

---

## 4. Functional Requirements

### 4.1 Catalog & Search
- FR-1. Storefront lists products, categories, collections, and product detail pages.
- FR-2. When MeiliSearch is configured, product search is served from the `products` index (fields: title, description, variant_sku); otherwise search is disabled gracefully.
- FR-3. Product media is served from MinIO when configured, else from local backend storage (`/static`).

### 4.2 Cart & Checkout
- FR-4. Shopper can add/remove line items and edit quantities.
- FR-5. Checkout collects shipping address and contact email. **All checkout fields are optional / email is non-mandatory** (per recent product decision — see git history).
- FR-6. Shopper selects a shipping option and a payment provider available for their region.
- FR-7. The storefront fetches the publishable API key at runtime from the backend `key-exchange` endpoint when needed.

### 4.3 Payments
- FR-8. **Stripe** — standard Medusa Stripe flow with auto-capture enabled.
- FR-9. **RinggitPay** — initiate a payment session that produces a signed (`SHA-256`) payment payload and a hosted-payment redirect; supports MYR and SGD with country-code-aware return URLs.
- FR-10. **HitPay** — create a HitPay `payment-request` via REST, return the hosted `payment_url`; default region SGD.
- FR-11. A payment session must be **verified** before it is marked captured:
  - RinggitPay: recompute and compare `rp_checkSum`.
  - HitPay: map `event_type` (`authorized_amount` → authorized, `success` → captured).
- FR-12. On a successful/authorized payment webhook, the system updates the Medusa payment session and **completes the cart** to create the order (idempotently — skips already-completed carts).

### 4.4 Orders & Notifications
- FR-13. A completed cart produces a Medusa order.
- FR-14. On `order.placed`, the system emails an order confirmation via **Resend** or **SendGrid** (whichever is configured), rendering a React-Email template.
- FR-15. On admin `invite.created`, an invite email is sent.

### 4.5 Admin
- FR-16. Medusa Admin dashboard is served from the backend (can be disabled via `SHOULD_DISABLE_ADMIN`/worker mode).
- FR-17. Admins seed/manage catalog, regions, currencies, shipping, and view/fulfill orders.

---

## 5. Non-Functional Requirements

- NFR-1. **Graceful degradation** — Redis, MinIO, MeiliSearch, and each payment/email provider are optional; the system boots with sensible local fallbacks (simulated Redis, local file storage, search disabled).
- NFR-2. **Security** — payment webhooks must verify provider authenticity before mutating order/payment state; secrets live only in environment variables.
- NFR-3. **Idempotency** — cart-completion is guarded by `completed_at` so duplicate webhooks don't double-create orders.
- NFR-4. **Worker/Server split** — backend supports `shared` / `server` / `worker` modes for scaling background work (requires Redis for the Redis-backed event bus and workflow engine).
- NFR-5. **Deployability** — one-click Railway template; Node 22.x, pnpm 9.

---

## 6. System Context

```
        ┌──────────────┐         Store/Admin REST API        ┌─────────────────────┐
        │  Shopper      │  ───────────────────────────────►  │  Medusa Backend      │
        │  (browser)    │  ◄───────────────────────────────  │  (Node 22, Medusa    │
        └──────┬───────┘         HTML / JSON                  │   2.8.8)             │
               │                                              │  - Store API         │
               │ hosted payment redirect                     │  - Admin API + UI    │
               ▼                                              │  - Payment module    │
        ┌──────────────┐    webhook (server-to-server)        │  - Notification mod. │
        │ Payment GW    │ ───────────────────────────────►   │  - File / Search mod.│
        │ RinggitPay /  │                                     └───────┬─────────────┘
        │ HitPay /      │ ◄── form-POST return ──► Next.js            │
        │ Stripe        │        storefront callback                  │
        └──────────────┘                                              ▼
                                              Postgres │ Redis │ MinIO │ MeiliSearch
                                              Resend / SendGrid (email)
```

See `WORKFLOWS.md` for detailed sequence diagrams.

---

## 7. Success Metrics
- Checkout completion rate (cart → paid order).
- Payment webhook verification success rate (signed payloads accepted, forged rejected).
- Order-confirmation email delivery rate.
- Zero duplicate orders from repeated webhooks.

---

## 8. Risks & Open Issues

| ID | Risk | Notes |
|----|------|-------|
| R-1 | **Refunds/captures are no-ops** for RinggitPay and HitPay | `capturePayment`, `refundPayment`, `cancelPayment` return input data unchanged; refunds must be handled in the provider portal. |
| R-2 | **HitPay webhook signature not verified** | Handler maps `event_type` but does not validate an HMAC; consider verifying HitPay's HMAC before trusting `success`. |
| R-3 | Hardcoded country code (`sg`) in HitPay `initiatePayment` redirect | Should derive from cart shipping address. |
| R-4 | RinggitPay webhook instantiates the provider service directly with env keys rather than resolving the configured module instance | Works, but bypasses module DI. |
| R-5 | `STORE_URL` / `BACKEND_URL` env coupling | Redirect/webhook URLs depend on correctly set public domains; misconfiguration breaks the return flow. |

---

## 9. References
- `RinggitPay_Payment Gateway Integration & Testing _Guide_v1.19.pdf` (RinggitPay spec, repo root)
- `backend/src/modules/ringgitpay/service.ts`, `backend/src/modules/hitpay/service.ts`
- `backend/src/api/api/webhooks/ringgitpay/route.ts`, `backend/src/api/webhooks/hitpay/route.ts`
- `storefront/src/app/api/ringgitpay/callback/route.ts`
- Medusa docs: https://docs.medusajs.com
