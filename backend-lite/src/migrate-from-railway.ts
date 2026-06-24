/**
 * One-shot ETL: load real catalog data exported from the Railway Medusa Postgres
 * into a fresh backend-lite SQLite database.
 *
 *   DB_PATH=/path/to/new.db tsx src/migrate-from-railway.ts /path/to/railway-data.json
 *
 * Reuses the live schema + helpers from db.ts so the result is byte-identical in
 * shape to what `npm run seed` produces — only the rows differ (real products
 * instead of the demo catalog). Medusa ids are reused verbatim (they are just
 * TEXT keys) to preserve every relationship.
 */
import { readFileSync } from "node:fs"
import { db, now, initSchema, hashPassword } from "./db.js"
import { config, PROVIDER_RINGGITPAY } from "./config.js"

const jsonPath = process.argv[2]
if (!jsonPath) {
  console.error("usage: tsx src/migrate-from-railway.ts <railway-data.json>")
  process.exit(1)
}
const data = JSON.parse(readFileSync(jsonPath, "utf8"))
const ts = now()

function asMeta(v: unknown): string | null {
  if (v == null) return null
  return typeof v === "string" ? v : JSON.stringify(v)
}

// Same wipe list as seed.ts so re-running is idempotent.
function clear() {
  const tables = [
    "variant_option_value", "product_option_value", "product_option",
    "product_image", "price", "product_variant", "product_category_product",
    "product", "category", "collection", "shipping_option",
    "region_payment_provider", "region_country", "region", "payment_provider",
    "customer_address", "auth_identity", "customer",
    "payment_session", "payment_collection", "shipping_method", "line_item",
    "order_payment", '"order"', "cart", "counter",
  ]
  db.exec("PRAGMA foreign_keys = OFF")
  for (const t of tables) db.exec(`DELETE FROM ${t}`)
  db.exec("PRAGMA foreign_keys = ON")
}

const run = db.transaction(() => {
  clear()

  // ---- payment providers ----
  const insPP = db.prepare("INSERT INTO payment_provider (id, is_enabled) VALUES (?, 1)")
  insPP.run(PROVIDER_RINGGITPAY)

  // ---- region (single Malaysia / MYR region from source) ----
  const region = data.region
  db.prepare(
    "INSERT INTO region (id, name, currency_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(region.id, region.name, region.currency_code, ts, ts)

  const insCountry = db.prepare(
    "INSERT OR IGNORE INTO region_country (iso_2, region_id, iso_3, num_code, name, display_name) VALUES (?, ?, ?, ?, ?, ?)"
  )
  for (const c of data.countries) {
    insCountry.run(c.iso_2, region.id, c.iso_3 ?? null, c.num_code ?? null,
      c.name ?? c.iso_2?.toUpperCase(), c.display_name ?? c.name ?? c.iso_2?.toUpperCase())
  }

  // Region currency is MYR -> RinggitPay only (Manual Payment intentionally omitted).
  const insRPP = db.prepare("INSERT INTO region_payment_provider (region_id, provider_id) VALUES (?, ?)")
  insRPP.run(region.id, PROVIDER_RINGGITPAY)

  // ---- collections ----
  const insCol = db.prepare(
    "INSERT INTO collection (id, title, handle, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
  for (const c of data.collections) insCol.run(c.id, c.title, c.handle, ts, ts)

  // ---- products ----
  const insProduct = db.prepare(
    `INSERT INTO product (id, title, subtitle, description, handle, status, thumbnail, weight, collection_id, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const p of data.products) {
    insProduct.run(
      p.id, p.title, p.subtitle || null, p.description || null, p.handle,
      p.status || "published", p.thumbnail || null, p.weight ?? null,
      p.collection_id || null, asMeta(p.metadata),
      p.created_at || ts, p.updated_at || ts
    )
  }

  // ---- images ----
  const insImg = db.prepare("INSERT INTO product_image (id, product_id, url, rank) VALUES (?, ?, ?, ?)")
  for (const i of data.images) insImg.run(i.id, i.product_id, i.url, i.rank ?? 0)

  // ---- options + values ----
  const insOpt = db.prepare("INSERT INTO product_option (id, product_id, title, rank) VALUES (?, ?, ?, 0)")
  for (const o of data.options) insOpt.run(o.id, o.product_id, o.title)
  const insOptVal = db.prepare("INSERT INTO product_option_value (id, option_id, value) VALUES (?, ?, ?)")
  for (const v of data.option_values) insOptVal.run(v.id, v.option_id, v.value)

  // ---- variants ----
  // manage_inventory is forced OFF: the source inventory levels live in Medusa's
  // separate inventory module (not exported), so we treat everything as in-stock
  // rather than risk every variant reading as 0 / out of stock.
  const insVar = db.prepare(
    `INSERT INTO product_variant (id, product_id, title, sku, manage_inventory, allow_backorder, inventory_quantity, rank, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?, ?)`
  )
  for (const v of data.variants) {
    insVar.run(v.id, v.product_id, v.title || "Default variant", v.sku || null,
      v.allow_backorder ? 1 : 0, v.rank ?? 0, v.created_at || ts, v.updated_at || ts)
  }
  const insVov = db.prepare("INSERT OR IGNORE INTO variant_option_value (variant_id, option_value_id) VALUES (?, ?)")
  for (const vo of data.variant_options) insVov.run(vo.variant_id, vo.option_value_id)

  // ---- prices (major units, per currency, deduped & non-zero in the export) ----
  const insPrice = db.prepare("INSERT INTO price (id, variant_id, currency_code, amount) VALUES (?, ?, ?, ?)")
  let pn = 0
  for (const pr of data.prices) {
    insPrice.run(`price_mig_${(pn++).toString().padStart(6, "0")}`, pr.variant_id, pr.currency_code, pr.amount)
  }

  // ---- shipping (flat-rate, generated for the region in its own currency) ----
  // Medusa shipping options price via price-sets/zones we don't export, so we
  // recreate sensible flat rates like the demo seed (amounts in MYR here).
  const insSO = db.prepare(
    "INSERT INTO shipping_option (id, name, region_id, amount, price_type, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'flat', 'manual', ?, ?)"
  )
  insSO.run("so_mig_standard", "Standard Shipping", region.id, 10, ts, ts)
  insSO.run("so_mig_express", "Express Shipping", region.id, 25, ts, ts)

  // ---- customers (profiles only; Medusa password hashes are incompatible, so
  // no auth_identity is created — customers must reset their password to log in) ----
  const insCust = db.prepare(
    `INSERT INTO customer (id, email, first_name, last_name, phone, company_name, has_account, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const c of data.customers) {
    insCust.run(c.id, c.email, c.first_name || null, c.last_name || null, c.phone || null,
      c.company_name || null, c.has_account ? 1 : 0, asMeta(c.metadata), c.created_at || ts, c.updated_at || ts)
  }

  // ---- admin user (from env, same as seed) ----
  db.prepare(
    "INSERT INTO auth_identity (id, email, password_hash, actor_type, actor_id, created_at) VALUES (?, ?, ?, 'user', ?, ?)"
  ).run("authid_admin_mig", config.adminEmail, hashPassword(config.adminPassword), "user_admin_mig", ts)
})

initSchema()
run()

const n = (sql: string) => (db.prepare(sql).get() as any).n
console.log("✅ Migration complete:", {
  region: data.region?.name,
  products: n("SELECT COUNT(*) n FROM product"),
  variants: n("SELECT COUNT(*) n FROM product_variant"),
  prices: n("SELECT COUNT(*) n FROM price"),
  images: n("SELECT COUNT(*) n FROM product_image"),
  collections: n("SELECT COUNT(*) n FROM collection"),
  countries: n("SELECT COUNT(*) n FROM region_country"),
  customers: n("SELECT COUNT(*) n FROM customer"),
  shipping: n("SELECT COUNT(*) n FROM shipping_option"),
})
console.log(`   Admin login: ${config.adminEmail} / ${config.adminPassword}`)
