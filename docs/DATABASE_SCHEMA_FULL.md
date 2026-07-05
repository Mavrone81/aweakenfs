# Full Physical Database Schema

**Generated from a migrated database** — 2026-06-24
**Engine:** PostgreSQL 16.14
**Medusa:** 2.8.8 · **MikroORM:** 6.4.3
**Totals:** 128 base tables · 4 enum types · 84 foreign-key constraints

> ## How this was generated
> 1. Spun up a throwaway PostgreSQL 16 container.
> 2. Pointed `backend/.env` `DATABASE_URL` at it and ran `medusa db:migrate`
>    (all Medusa module migrations + the 2 data-migration scripts).
> 3. Dumped the result:
>    - **Raw DDL:** [`docs/schema.sql`](./schema.sql) — full `pg_dump --schema-only`
>      (6,955 lines: every `CREATE TABLE`, index, constraint, sequence, enum).
>    - **This document:** human-readable introspection of `information_schema` /
>      `pg_catalog` (table inventory, columns of the core tables, enums, FK map).
>
> The database was migrated **empty** (no seed), so this is the pure structural
> schema. `docs/schema.sql` is the authoritative, machine-readable artifact;
> this file is the navigable summary.

---

## 1. Important: Medusa uses module isolation, not cross-module foreign keys

Medusa 2.0 splits the domain into isolated **modules** (Cart, Payment, Order,
Product, …). Each module owns its own tables, and **relationships _within_ a module
are real Postgres foreign keys**, but relationships **_across_ modules are not
FK-enforced** — they are represented by **module-link join tables** instead.

Consequences you can see in the schema:
- `cart` has **no** FK to `payment_collection` or `region`. The cart↔payment-collection
  link lives in the `cart_payment_collection` table; cart↔region is resolved in the app layer.
- `payment_session.payment_collection_id` **is** a real FK (same module).
- `order`↔`cart` link → `order_cart`; `order`↔`payment_collection` → `order_payment_collection`.
- `region`↔payment providers → `region_payment_provider`.

So when reading the FK map in §5, remember: the absence of an FK between two tables
does **not** mean they are unrelated — check the link tables in §4.

---

## 2. Table inventory by module (all 128 tables)

Format: `table (columns · indexes · FKs)`

### Cart module
`cart (13·8·2)` · `cart_address (16·2·0)` · `cart_line_item (32·7·1)` ·
`cart_line_item_adjustment (13·5·1)` · `cart_line_item_tax_line (11·5·1)` ·
`cart_shipping_method (13·5·1)` · `cart_shipping_method_adjustment (12·5·1)` ·
`cart_shipping_method_tax_line (11·5·1)` · `credit_line (10·4·1)`

### Payment module ← **the project's custom providers live here**
`payment (14·6·1)` · `payment_collection (16·2·0)` · `payment_session (14·3·1)` ·
`payment_provider (5·2·0)` · `capture (9·3·1)` · `refund (11·4·1)` ·
`refund_reason (7·2·0)` · `account_holder (9·3·0)`

### Order module
`order (18·9·2)` · `order_address (16·3·0)` · `order_item (28·5·2)` ·
`order_line_item (31·3·1)` · `order_line_item_adjustment (12·2·1)` ·
`order_line_item_tax_line (11·2·1)` · `order_summary (7·3·1)` ·
`order_transaction (14·7·1)` · `order_change (24·9·1)` · `order_change_action (19·8·1)` ·
`order_claim (15·5·0)` · `order_claim_item (12·4·0)` · `order_claim_item_image (7·3·0)` ·
`order_credit_line (10·3·1)` · `order_exchange (15·5·0)` · `order_exchange_item (10·4·0)` ·
`order_shipping (10·8·1)` · `order_shipping_method (13·2·0)` ·
`order_shipping_method_adjustment (11·2·1)` · `order_shipping_method_tax_line (11·2·1)` ·
`return (19·5·0)` · `return_item (15·5·0)` · `return_reason (9·2·1)` · `return_fulfillment (6·5·0)`

### Product module
`product (24·5·2)` · `product_category (13·4·1)` · `product_collection (7·4·0)` ·
`product_option (7·4·1)` · `product_option_value (7·4·1)` · `product_tag (6·3·0)` ·
`product_type (6·3·0)` · `product_variant (22·8·1)` · `image (8·4·1)`

### Pricing module
`price (13·5·2)` · `price_list (11·2·0)` · `price_list_rule (7·4·1)` ·
`price_preference (7·3·0)` · `price_rule (9·8·1)` · `price_set (4·2·0)`

### Promotion module
`promotion (10·6·1)` · `promotion_application_method (14·7·1)` · `promotion_campaign (9·3·0)` ·
`promotion_campaign_budget (11·4·1)` · `promotion_rule (7·4·0)` · `promotion_rule_value (6·3·1)` ·
`application_method_buy_rules (2·1·2)` · `application_method_target_rules (2·1·2)`

### Inventory module
`inventory_item (18·3·0)` · `inventory_level (13·6·1)` · `reservation_item (14·5·1)`

### Fulfillment module
`fulfillment (17·4·3)` · `fulfillment_address (15·2·0)` · `fulfillment_item (12·5·1)` ·
`fulfillment_label (8·3·1)` · `fulfillment_provider (5·2·0)` · `fulfillment_set (7·3·0)` ·
`service_zone (7·4·1)` · `geo_zone (11·6·1)` · `shipping_option (12·5·4)` ·
`shipping_option_rule (8·3·1)` · `shipping_option_type (7·2·0)` · `shipping_profile (7·3·0)`

### Tax module
`tax_provider (5·2·0)` · `tax_rate (12·4·1)` · `tax_rate_rule (9·5·1)` · `tax_region (10·6·2)`

### Region / Currency / Store
`region (8·2·0)` · `region_country (10·4·1)` · `currency (10·1·0)` ·
`store (9·2·0)` · `store_currency (7·3·1)`

### Customer module
`customer (12·3·0)` · `customer_address (19·5·1)` · `customer_group (7·4·0)` ·
`customer_group_customer (8·4·2)`

### Sales channel / Stock location
`sales_channel (8·2·0)` · `stock_location (7·3·1)` · `stock_location_address (13·2·0)`

### Auth / User / API key / Notification
`auth_identity (5·2·0)` · `provider_identity (9·4·1)` · `user (9·3·0)` · `invite (9·4·0)` ·
`api_key (13·4·0)` · `notification (17·5·1)` · `notification_provider (8·2·0)`

### Workflow engine
`workflow_execution (11·7·0)`

### Module-link join tables (cross-module relationships — see §4)
`cart_payment_collection` · `cart_promotion` · `customer_account_holder` ·
`location_fulfillment_provider` · `location_fulfillment_set` · `order_cart` ·
`order_fulfillment` · `order_payment_collection` · `order_promotion` ·
`payment_collection_payment_providers` · `product_category_product` ·
`product_sales_channel` · `product_shipping_profile` · `product_tags` ·
`product_variant_inventory_item` · `product_variant_option` ·
`product_variant_price_set` · `promotion_promotion_rule` ·
`publishable_api_key_sales_channel` · `region_payment_provider` ·
`sales_channel_stock_location` · `shipping_option_price_set`

### Migration bookkeeping
`mikro_orm_migrations` · `script_migrations` · `link_module_migrations`

---

## 3. Detailed columns — Payment / Cart / Order core

These are the tables the custom RinggitPay/HitPay integrations and the
checkout→order flow read and write. `raw_*` jsonb columns hold Medusa's
`BigNumber` representation of the adjacent numeric column.

### `payment_session` — custom providers store their payload in `data`
| Column | Type | Null | Default / Notes |
|--------|------|------|---------|
| `id` | text | NO | PK |
| `currency_code` | text | NO | |
| `amount` | numeric | NO | |
| `raw_amount` | jsonb | NO | |
| `provider_id` | text | NO | `stripe` \| `ringgitpay` \| `hitpay` |
| `data` | **jsonb** | NO | `'{}'` — **custom provider payload (checksum, payment_url, …)** |
| `context` | jsonb | YES | |
| `status` | text | NO | `'pending'` → authorized / captured / canceled |
| `authorized_at` | timestamptz | YES | |
| `payment_collection_id` | text | NO | FK → `payment_collection.id` |
| `metadata` | jsonb | YES | |
| `created_at` / `updated_at` | timestamptz | NO | `now()` |
| `deleted_at` | timestamptz | YES | |

### `payment` — created on capture
| Column | Type | Null | Notes |
|--------|------|------|-------|
| `id` | text | NO | PK |
| `amount` / `raw_amount` | numeric / jsonb | NO | |
| `currency_code` | text | NO | |
| `provider_id` | text | NO | |
| `data` | jsonb | YES | |
| `captured_at` / `canceled_at` | timestamptz | YES | |
| `payment_collection_id` | text | NO | FK → `payment_collection.id` |
| `payment_session_id` | text | NO | logical link to session |
| `metadata` | jsonb | YES | |

### `payment_collection`
| Column | Type | Null | Default |
|--------|------|------|---------|
| `id` | text | NO | PK |
| `currency_code` | text | NO | |
| `amount` / `raw_amount` | numeric / jsonb | NO | |
| `authorized_amount` / `captured_amount` / `refunded_amount` (+ `raw_*`) | numeric / jsonb | YES | running totals |
| `status` | text | NO | `'not_paid'` |
| `completed_at` | timestamptz | YES | |
| `metadata` | jsonb | YES | |

### `capture` and `refund`
- `capture (id, amount, raw_amount, payment_id → payment.id, created_at, updated_at, deleted_at, created_by, metadata)`
- `refund (id, amount, raw_amount, payment_id → payment.id, refund_reason_id, note, created_by, metadata, …)`

### `cart`
| Column | Type | Null | Notes |
|--------|------|------|-------|
| `id` | text | NO | PK (`cart_…`) — RinggitPay merchant reference |
| `region_id` | text | YES | app-level link, no FK |
| `customer_id` | text | YES | |
| `sales_channel_id` | text | YES | |
| `email` | text | **YES** | guest checkout; email optional |
| `currency_code` | text | NO | `myr` / `sgd` / … |
| `shipping_address_id` / `billing_address_id` | text | YES | FK → `cart_address.id` |
| `completed_at` | timestamptz | YES | **idempotency guard for cart completion** |
| `metadata` | jsonb | YES | |

### `order` (header)
| Column | Type | Null | Notes |
|--------|------|------|-------|
| `id` | text | NO | PK |
| `display_id` | integer | YES | sequence `order_display_id_seq` |
| `region_id` / `customer_id` / `sales_channel_id` | text | YES | app-level links |
| `version` | integer | NO | default `1` (order-edit versioning) |
| `status` | `order_status_enum` | NO | `'pending'` (see §6) |
| `is_draft_order` | boolean | NO | `false` |
| `email` | text | YES | |
| `currency_code` | text | NO | |
| `shipping_address_id` / `billing_address_id` | text | YES | FK → `order_address.id` |
| `canceled_at` | timestamptz | YES | |

### `order` children used by the confirmation email
- `order_line_item` — denormalized product snapshot (`title`, `variant_sku`, `unit_price`, `product_*`, …).
- `order_item` — links a line item to the order with fulfilled/shipped/returned quantities (`item_id` → `order_line_item.id`, `order_id` → `order.id`).
- `order_summary` — `totals` jsonb per order version.
- `order_transaction` — money movements (`amount`, `currency_code`, `reference`, `reference_id`).
- `order_address` — snapshot address retrieved by the `order-placed` subscriber.

---

## 4. Module-link tables (the cross-module joins)

Because cross-module relations aren't FKs, these tables are how the domain is wired
together. Each holds the two ids plus `id`, timestamps, and `deleted_at`.

| Link table | Connects |
|------------|----------|
| `cart_payment_collection` | cart ↔ payment_collection |
| `order_cart` | order ↔ cart |
| `order_payment_collection` | order ↔ payment_collection |
| `order_fulfillment` | order ↔ fulfillment |
| `order_promotion` / `cart_promotion` | order/cart ↔ promotion |
| `region_payment_provider` | region ↔ payment_provider (which providers a region offers) |
| `payment_collection_payment_providers` | payment_collection ↔ payment_provider (**has real FKs**) |
| `product_sales_channel` | product ↔ sales_channel |
| `product_category_product` | product ↔ category |
| `product_variant_price_set` | variant ↔ price_set |
| `product_variant_inventory_item` | variant ↔ inventory_item |
| `product_variant_option` | variant ↔ option_value |
| `product_shipping_profile` | product ↔ shipping_profile |
| `shipping_option_price_set` | shipping_option ↔ price_set |
| `publishable_api_key_sales_channel` | api_key ↔ sales_channel |
| `sales_channel_stock_location` | sales_channel ↔ stock_location |
| `location_fulfillment_set` / `location_fulfillment_provider` | stock_location ↔ fulfillment_set/provider |
| `customer_account_holder` | customer ↔ account_holder (payment) |
| `promotion_promotion_rule` | promotion ↔ promotion_rule |

---

## 5. Foreign-key map (84 constraints, all intra-module)

```
# Payment
capture.payment_id                              → payment.id
refund.payment_id                               → payment.id
payment.payment_collection_id                   → payment_collection.id
payment_session.payment_collection_id           → payment_collection.id
payment_collection_payment_providers.payment_collection_id → payment_collection.id
payment_collection_payment_providers.payment_provider_id   → payment_provider.id

# Cart
cart.shipping_address_id                         → cart_address.id
cart.billing_address_id                          → cart_address.id
cart_line_item.cart_id                           → cart.id
cart_line_item_adjustment.item_id                → cart_line_item.id
cart_line_item_tax_line.item_id                  → cart_line_item.id
cart_shipping_method.cart_id                     → cart.id
cart_shipping_method_adjustment.shipping_method_id → cart_shipping_method.id
cart_shipping_method_tax_line.shipping_method_id → cart_shipping_method.id
credit_line.cart_id                              → cart.id

# Order
order.shipping_address_id                        → order_address.id
order.billing_address_id                         → order_address.id
order_item.order_id                              → order.id
order_item.item_id                               → order_line_item.id
order_line_item.totals_id                        → order_item.id
order_line_item_adjustment.item_id               → order_line_item.id
order_line_item_tax_line.item_id                 → order_line_item.id
order_summary.order_id                           → order.id
order_transaction.order_id                       → order.id
order_shipping.order_id                          → order.id
order_shipping_method_adjustment.shipping_method_id → order_shipping_method.id
order_shipping_method_tax_line.shipping_method_id   → order_shipping_method.id
order_change.order_id                            → order.id
order_change_action.order_change_id              → order_change.id
order_credit_line.order_id                       → order.id

# Product / Pricing
product.collection_id                            → product_collection.id
product.type_id                                  → product_type.id
product_category.parent_category_id              → product_category.id
product_category_product.product_id/category_id  → product.id / product_category.id
product_option.product_id                        → product.id
product_option_value.option_id                   → product_option.id
product_variant.product_id                       → product.id
product_variant_option.variant_id/option_value_id → product_variant.id / product_option_value.id
product_tags.product_id/product_tag_id           → product.id / product_tag.id
image.product_id                                 → product.id
price.price_set_id / price.price_list_id         → price_set.id / price_list.id
price_rule.price_id                              → price.id
price_list_rule.price_list_id                    → price_list.id

# Promotion
promotion.campaign_id                            → promotion_campaign.id
promotion_application_method.promotion_id        → promotion.id
promotion_campaign_budget.campaign_id            → promotion_campaign.id
promotion_promotion_rule.*                       → promotion.id / promotion_rule.id
promotion_rule_value.promotion_rule_id           → promotion_rule.id
application_method_buy_rules.*                    → promotion_application_method.id / promotion_rule.id
application_method_target_rules.*                 → promotion_application_method.id / promotion_rule.id

# Fulfillment / Shipping
fulfillment.delivery_address_id                  → fulfillment_address.id
fulfillment.provider_id                          → fulfillment_provider.id
fulfillment.shipping_option_id                   → shipping_option.id
fulfillment_item.fulfillment_id                  → fulfillment.id
fulfillment_label.fulfillment_id                 → fulfillment.id
service_zone.fulfillment_set_id                  → fulfillment_set.id
geo_zone.service_zone_id                         → service_zone.id
shipping_option.provider_id                      → fulfillment_provider.id
shipping_option.service_zone_id                  → service_zone.id
shipping_option.shipping_option_type_id          → shipping_option_type.id
shipping_option.shipping_profile_id              → shipping_profile.id
shipping_option_rule.shipping_option_id          → shipping_option.id

# Inventory / Tax / Region / Customer / Auth / Store
inventory_level.inventory_item_id                → inventory_item.id
reservation_item.inventory_item_id               → inventory_item.id
tax_rate.tax_region_id                           → tax_region.id
tax_rate_rule.tax_rate_id                        → tax_rate.id
tax_region.parent_id / provider_id               → tax_region.id / tax_provider.id
region_country.region_id                         → region.id
customer_address.customer_id                     → customer.id
customer_group_customer.*                        → customer_group.id / customer.id
provider_identity.auth_identity_id               → auth_identity.id
stock_location.address_id                         → stock_location_address.id
store_currency.store_id                          → store.id
notification.provider_id                         → notification_provider.id
return_reason.parent_return_reason_id            → return_reason.id
```

---

## 6. Enum types

| Enum | Values |
|------|--------|
| `order_status_enum` | `pending`, `completed`, `draft`, `archived`, `canceled`, `requires_action` |
| `return_status_enum` | `open`, `requested`, `received`, `partially_received`, `canceled` |
| `claim_reason_enum` | `missing_item`, `wrong_item`, `production_failure`, `other` |
| `order_claim_type_enum` | `refund`, `replace` |

> `payment_session.status` and `payment_collection.status` are **plain `text`**, not
> enums (values `pending`/`authorized`/`captured`/`canceled` and `not_paid`/… are
> enforced in application code, not the DB).

---

## 7. Regenerating this schema

```bash
# 1. Start a disposable Postgres
docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=medusa -p 5433:5432 postgres:16

# 2. Point backend/.env at it
echo 'DATABASE_URL=postgres://postgres:postgres@localhost:5433/medusa' >> backend/.env

# 3. Migrate (from backend/)
pnpm install && node_modules/.bin/medusa db:migrate

# 4. Dump
docker exec pg pg_dump -U postgres -d medusa --schema-only --no-owner --no-privileges > docs/schema.sql
```

The version-pinned DDL lives in [`docs/schema.sql`](./schema.sql).
