import { Router } from "express"
import { db, genId, now, parseJSON } from "../db.js"
import { requireAdmin } from "../auth.js"
import { serializeOrder } from "../serialize.js"
import { reconcilePendingRinggitPay } from "../reconcile.js"
import { enquireTransaction, verifyWebhookChecksum, mapStatus } from "../ringgitpay.js"
import { getRinggitPayLogs } from "../rplog.js"

type Row = Record<string, any>
export const adminRouter = Router()
adminRouter.use(requireAdmin)

// ---- helpers ----
function variantPrices(variantId: string) {
  return (db.prepare("SELECT currency_code, amount FROM price WHERE variant_id = ?").all(variantId) as Row[])
    .map((p) => ({ currency_code: p.currency_code, amount: Number(p.amount) }))
}
function adminVariant(v: Row) {
  return {
    id: v.id, title: v.title, sku: v.sku,
    inventory_quantity: v.inventory_quantity,
    manage_inventory: !!v.manage_inventory,
    allow_backorder: !!v.allow_backorder,
    prices: variantPrices(v.id),
  }
}
function adminProduct(p: Row) {
  const variants = db.prepare("SELECT * FROM product_variant WHERE product_id = ? ORDER BY rank").all(p.id) as Row[]
  const images = db.prepare("SELECT id, url FROM product_image WHERE product_id = ? ORDER BY rank").all(p.id) as Row[]
  const categories = db.prepare(
    "SELECT category_id FROM product_category_product WHERE product_id = ?"
  ).all(p.id) as Row[]
  return {
    id: p.id, title: p.title, subtitle: p.subtitle, description: p.description,
    handle: p.handle, status: p.status, thumbnail: p.thumbnail,
    collection_id: p.collection_id,
    images, variants: variants.map(adminVariant),
    category_ids: categories.map((c) => c.category_id),
    created_at: p.created_at, updated_at: p.updated_at,
    metadata: parseJSON(p.metadata, null),
  }
}

// ===================== PRODUCTS =====================
adminRouter.get("/products", (_req, res) => {
  const rows = db.prepare("SELECT * FROM product ORDER BY created_at DESC").all() as Row[]
  res.json({ products: rows.map(adminProduct) })
})

adminRouter.get("/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM product WHERE id = ?").get(req.params.id) as Row | undefined
  if (!p) return res.status(404).json({ message: "Product not found" })
  res.json({ product: adminProduct(p) })
})

adminRouter.post("/products", (req, res) => {
  const b = req.body || {}
  if (!b.title) return res.status(400).json({ message: "title is required" })
  const ts = now()
  const id = genId("prod")
  const handle = (b.handle || String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) + ""
  db.prepare(
    "INSERT INTO product (id, title, subtitle, description, handle, status, thumbnail, collection_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, b.title, b.subtitle ?? null, b.description ?? null, handle, b.status || "published", b.thumbnail ?? null, b.collection_id ?? null, ts, ts)
  if (b.thumbnail) db.prepare("INSERT INTO product_image (id, product_id, url, rank) VALUES (?, ?, ?, 0)").run(genId("img"), id, b.thumbnail)
  res.json({ product: adminProduct(db.prepare("SELECT * FROM product WHERE id = ?").get(id) as Row) })
})

adminRouter.post("/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM product WHERE id = ?").get(req.params.id) as Row | undefined
  if (!p) return res.status(404).json({ message: "Product not found" })
  const b = req.body || {}
  const ts = now()
  for (const f of ["title", "subtitle", "description", "handle", "status", "thumbnail", "collection_id"]) {
    if (b[f] !== undefined) db.prepare(`UPDATE product SET ${f} = ?, updated_at = ? WHERE id = ?`).run(b[f], ts, p.id)
  }
  if (Array.isArray(b.category_ids)) {
    db.prepare("DELETE FROM product_category_product WHERE product_id = ?").run(p.id)
    for (const cid of b.category_ids) db.prepare("INSERT INTO product_category_product (category_id, product_id) VALUES (?, ?)").run(cid, p.id)
  }
  res.json({ product: adminProduct(db.prepare("SELECT * FROM product WHERE id = ?").get(p.id) as Row) })
})

adminRouter.delete("/products/:id", (req, res) => {
  db.prepare("DELETE FROM product WHERE id = ?").run(req.params.id)
  res.json({ id: req.params.id, deleted: true })
})

// ---- variants ----
adminRouter.post("/products/:id/variants", (req, res) => {
  const p = db.prepare("SELECT * FROM product WHERE id = ?").get(req.params.id) as Row | undefined
  if (!p) return res.status(404).json({ message: "Product not found" })
  const b = req.body || {}
  const ts = now()
  const vid = genId("variant")
  const rank = (db.prepare("SELECT COUNT(*) n FROM product_variant WHERE product_id = ?").get(p.id) as Row).n
  db.prepare(
    "INSERT INTO product_variant (id, product_id, title, sku, manage_inventory, allow_backorder, inventory_quantity, rank, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(vid, p.id, b.title || "Default", b.sku ?? null, b.manage_inventory === false ? 0 : 1, b.allow_backorder ? 1 : 0, b.inventory_quantity ?? 0, rank, ts, ts)
  for (const pr of b.prices || []) {
    db.prepare("INSERT INTO price (id, variant_id, currency_code, amount) VALUES (?, ?, ?, ?)").run(genId("price"), vid, String(pr.currency_code).toLowerCase(), Number(pr.amount))
  }
  res.json({ variant: adminVariant(db.prepare("SELECT * FROM product_variant WHERE id = ?").get(vid) as Row) })
})

adminRouter.post("/variants/:vid", (req, res) => {
  const v = db.prepare("SELECT * FROM product_variant WHERE id = ?").get(req.params.vid) as Row | undefined
  if (!v) return res.status(404).json({ message: "Variant not found" })
  const b = req.body || {}
  const ts = now()
  for (const f of ["title", "sku", "inventory_quantity"]) {
    if (b[f] !== undefined) db.prepare(`UPDATE product_variant SET ${f} = ?, updated_at = ? WHERE id = ?`).run(b[f], ts, v.id)
  }
  if (b.manage_inventory !== undefined) db.prepare("UPDATE product_variant SET manage_inventory = ? WHERE id = ?").run(b.manage_inventory ? 1 : 0, v.id)
  if (b.allow_backorder !== undefined) db.prepare("UPDATE product_variant SET allow_backorder = ? WHERE id = ?").run(b.allow_backorder ? 1 : 0, v.id)
  res.json({ variant: adminVariant(db.prepare("SELECT * FROM product_variant WHERE id = ?").get(v.id) as Row) })
})

adminRouter.delete("/variants/:vid", (req, res) => {
  db.prepare("DELETE FROM product_variant WHERE id = ?").run(req.params.vid)
  res.json({ id: req.params.vid, deleted: true })
})

// upsert a price for a variant+currency
adminRouter.post("/variants/:vid/prices", (req, res) => {
  const v = db.prepare("SELECT * FROM product_variant WHERE id = ?").get(req.params.vid) as Row | undefined
  if (!v) return res.status(404).json({ message: "Variant not found" })
  const cur = String(req.body?.currency_code || "").toLowerCase()
  const amount = Number(req.body?.amount)
  if (!cur || !Number.isFinite(amount)) return res.status(400).json({ message: "currency_code and amount required" })
  const existing = db.prepare("SELECT id FROM price WHERE variant_id = ? AND currency_code = ?").get(v.id, cur) as Row | undefined
  if (existing) db.prepare("UPDATE price SET amount = ? WHERE id = ?").run(amount, existing.id)
  else db.prepare("INSERT INTO price (id, variant_id, currency_code, amount) VALUES (?, ?, ?, ?)").run(genId("price"), v.id, cur, amount)
  res.json({ variant: adminVariant(db.prepare("SELECT * FROM product_variant WHERE id = ?").get(v.id) as Row) })
})

// ===================== REGIONS =====================
function adminRegion(r: Row) {
  const countries = db.prepare("SELECT iso_2, display_name FROM region_country WHERE region_id = ?").all(r.id) as Row[]
  const providers = db.prepare("SELECT provider_id FROM region_payment_provider WHERE region_id = ?").all(r.id) as Row[]
  return {
    id: r.id, name: r.name, currency_code: r.currency_code,
    countries, payment_providers: providers.map((p) => p.provider_id),
  }
}
adminRouter.get("/regions", (_req, res) => {
  const rows = db.prepare("SELECT * FROM region ORDER BY name").all() as Row[]
  res.json({ regions: rows.map(adminRegion) })
})
adminRouter.post("/regions", (req, res) => {
  const b = req.body || {}
  if (!b.name || !b.currency_code) return res.status(400).json({ message: "name and currency_code required" })
  const ts = now(); const id = genId("reg")
  db.prepare("INSERT INTO region (id, name, currency_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, b.name, String(b.currency_code).toLowerCase(), ts, ts)
  res.json({ region: adminRegion(db.prepare("SELECT * FROM region WHERE id = ?").get(id) as Row) })
})
adminRouter.post("/regions/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM region WHERE id = ?").get(req.params.id) as Row | undefined
  if (!r) return res.status(404).json({ message: "Region not found" })
  const b = req.body || {}; const ts = now()
  if (b.name !== undefined) db.prepare("UPDATE region SET name = ?, updated_at = ? WHERE id = ?").run(b.name, ts, r.id)
  if (b.currency_code !== undefined) db.prepare("UPDATE region SET currency_code = ?, updated_at = ? WHERE id = ?").run(String(b.currency_code).toLowerCase(), ts, r.id)
  res.json({ region: adminRegion(db.prepare("SELECT * FROM region WHERE id = ?").get(r.id) as Row) })
})
adminRouter.delete("/regions/:id", (req, res) => {
  db.prepare("DELETE FROM region WHERE id = ?").run(req.params.id)
  res.json({ id: req.params.id, deleted: true })
})

// region countries
adminRouter.post("/regions/:id/countries", (req, res) => {
  const iso2 = String(req.body?.iso_2 || "").toLowerCase()
  if (!iso2) return res.status(400).json({ message: "iso_2 required" })
  db.prepare("INSERT OR REPLACE INTO region_country (iso_2, region_id, display_name) VALUES (?, ?, ?)").run(iso2, req.params.id, req.body?.display_name || iso2.toUpperCase())
  res.json({ region: adminRegion(db.prepare("SELECT * FROM region WHERE id = ?").get(req.params.id) as Row) })
})
adminRouter.delete("/regions/:id/countries/:iso2", (req, res) => {
  db.prepare("DELETE FROM region_country WHERE region_id = ? AND iso_2 = ?").run(req.params.id, req.params.iso2.toLowerCase())
  res.json({ region: adminRegion(db.prepare("SELECT * FROM region WHERE id = ?").get(req.params.id) as Row) })
})

// ===================== PAYMENT MODES =====================
adminRouter.get("/payment-providers", (_req, res) => {
  const rows = db.prepare("SELECT id, is_enabled FROM payment_provider").all() as Row[]
  res.json({ payment_providers: rows.map((p) => ({ id: p.id, is_enabled: !!p.is_enabled })) })
})
adminRouter.post("/regions/:id/payment-providers", (req, res) => {
  const pid = req.body?.provider_id
  if (!pid) return res.status(400).json({ message: "provider_id required" })
  db.prepare("INSERT OR IGNORE INTO region_payment_provider (region_id, provider_id) VALUES (?, ?)").run(req.params.id, pid)
  res.json({ region: adminRegion(db.prepare("SELECT * FROM region WHERE id = ?").get(req.params.id) as Row) })
})
adminRouter.delete("/regions/:id/payment-providers/:pid", (req, res) => {
  db.prepare("DELETE FROM region_payment_provider WHERE region_id = ? AND provider_id = ?").run(req.params.id, req.params.pid)
  res.json({ region: adminRegion(db.prepare("SELECT * FROM region WHERE id = ?").get(req.params.id) as Row) })
})

// ===================== SHIPPING =====================
adminRouter.get("/shipping-options", (_req, res) => {
  const rows = db.prepare("SELECT * FROM shipping_option ORDER BY created_at").all() as Row[]
  res.json({ shipping_options: rows.map((o) => ({ id: o.id, name: o.name, region_id: o.region_id, amount: Number(o.amount), price_type: o.price_type, provider_id: o.provider_id })) })
})
adminRouter.post("/shipping-options", (req, res) => {
  const b = req.body || {}
  if (!b.name) return res.status(400).json({ message: "name required" })
  const ts = now(); const id = genId("so")
  db.prepare("INSERT INTO shipping_option (id, name, region_id, amount, price_type, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'flat', 'manual', ?, ?)")
    .run(id, b.name, b.region_id ?? null, Number(b.amount) || 0, ts, ts)
  res.json({ shipping_option: db.prepare("SELECT * FROM shipping_option WHERE id = ?").get(id) })
})
adminRouter.post("/shipping-options/:id", (req, res) => {
  const o = db.prepare("SELECT * FROM shipping_option WHERE id = ?").get(req.params.id) as Row | undefined
  if (!o) return res.status(404).json({ message: "Shipping option not found" })
  const b = req.body || {}; const ts = now()
  if (b.name !== undefined) db.prepare("UPDATE shipping_option SET name = ?, updated_at = ? WHERE id = ?").run(b.name, ts, o.id)
  if (b.amount !== undefined) db.prepare("UPDATE shipping_option SET amount = ?, updated_at = ? WHERE id = ?").run(Number(b.amount), ts, o.id)
  if (b.region_id !== undefined) db.prepare("UPDATE shipping_option SET region_id = ?, updated_at = ? WHERE id = ?").run(b.region_id, ts, o.id)
  res.json({ shipping_option: db.prepare("SELECT * FROM shipping_option WHERE id = ?").get(o.id) })
})
adminRouter.delete("/shipping-options/:id", (req, res) => {
  db.prepare("DELETE FROM shipping_option WHERE id = ?").run(req.params.id)
  res.json({ id: req.params.id, deleted: true })
})

// ===================== COLLECTIONS / CATEGORIES (for pickers) =====================
adminRouter.get("/collections", (_req, res) => {
  res.json({ collections: db.prepare("SELECT id, title, handle FROM collection ORDER BY title").all() })
})
adminRouter.get("/categories", (_req, res) => {
  res.json({ categories: db.prepare("SELECT id, name, handle, parent_category_id FROM category ORDER BY rank").all() })
})

// ===================== ORDERS =====================
adminRouter.get("/orders", (_req, res) => {
  const rows = db.prepare('SELECT id FROM "order" ORDER BY created_at DESC LIMIT 100').all() as Row[]
  res.json({ orders: rows.map((r) => serializeOrder(r.id)) })
})
adminRouter.get("/orders/:id", (req, res) => {
  const order = serializeOrder(req.params.id)
  if (!order) return res.status(404).json({ message: "Order not found" })
  res.json({ order })
})

// ===================== RINGGITPAY RECONCILE / ENQUIRY =====================
// Manually resolve every pending RinggitPay session via the Transaction Enquiry API.
adminRouter.post("/ringgitpay/reconcile", async (_req, res) => {
  try {
    const result = await reconcilePendingRinggitPay()
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "reconcile failed" })
  }
})

// Audit trail of every RinggitPay interaction (requests sent + responses received).
// Filter by ?orderId=RP... and/or ?limit=.
adminRouter.get("/ringgitpay/logs", (req, res) => {
  const logs = getRinggitPayLogs({
    orderId: (req.query.orderId as string) || undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  })
  res.json({ logs, count: logs.length })
})

// Look up a single transaction's authoritative status (does not mutate anything).
adminRouter.get("/ringgitpay/enquiry/:orderId", async (req, res) => {
  try {
    const resp = await enquireTransaction(req.params.orderId, (req.query.transactionRef as string) || null)
    if (!resp || !resp.rp_statusCode) return res.status(502).json({ message: "no response from gateway" })
    const verified = verifyWebhookChecksum(resp)
    res.json({
      verified,
      statusCode: resp.rp_statusCode,
      status: verified ? mapStatus(resp.rp_statusCode) : "unverified",
      response: resp,
    })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "enquiry failed" })
  }
})
