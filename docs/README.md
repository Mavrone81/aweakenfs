# EcommerceV2 — System Documentation

A headless commerce platform on **MedusaJS 2.8.8** (backend) + **Next.js** (storefront),
extended with custom Southeast-Asian payment gateways: **RinggitPay** (Malaysia, MYR/SGD)
and **HitPay** (Singapore, SGD), alongside stock **Stripe**.

| Document | Contents |
|----------|----------|
| [PRD.md](./PRD.md) | Product requirements — goals, personas, functional/non-functional requirements, risks |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Data model — relevant Medusa tables + custom provider payloads stored in `payment_session.data` |
| [DATABASE_SCHEMA_FULL.md](./DATABASE_SCHEMA_FULL.md) | **Full physical schema dumped from a migrated DB** — all 128 tables, enums, FK map |
| [schema.sql](./schema.sql) | Raw `pg_dump --schema-only` DDL (authoritative, machine-readable) |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | All backend & storefront environment variables |
| [API.md](./API.md) | Custom routes, payment webhooks, and the Medusa API surface |
| [WORKFLOWS.md](./WORKFLOWS.md) | Mermaid architecture + checkout/payment/order sequence diagrams |
| [DOCKER.md](./DOCKER.md) | Docker deployment — Dockerfiles, compose stack, networking, production notes |

**Source of truth:** these docs were written from the code as of 2026-06-24 —
key files are `backend/src/modules/{ringgitpay,hitpay}/service.ts`,
`backend/src/api/**/webhooks/**/route.ts`, `backend/medusa-config.js`, and
`storefront/src/app/api/ringgitpay/callback/route.ts`. The RinggitPay spec PDF
(`RinggitPay_Payment Gateway Integration & Testing _Guide_v1.19.pdf`) lives at the repo root.
