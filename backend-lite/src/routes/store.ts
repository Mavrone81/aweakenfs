import { Router, type Request, type Response } from "express"
import { db, genId, now, parseJSON } from "../db.js"
import {
  serializeRegion, serializeProduct, serializeCollection, serializeCategory,
  serializeShippingOption, serializeCart, serializeOrder, serializeCustomer,
  serializeAddress, regionCurrency, variantPrice,
} from "../serialize.js"
import { completeCart } from "../complete.js"
import { buildRinggitPaySession, genOrderRef } from "../ringgitpay.js"
import { PROVIDER_RINGGITPAY } from "../config.js"
import { logRinggitPay } from "../rplog.js"
import { requireCustomer, requireCustomerToken } from "../auth.js"

type Row = Record<string, any>
export const storeRouter = Router()

// ---- query helpers ----
function toArray(v: unknown): string[] | undefined {
  if (v == null) return undefined
  if (Array.isArray(v)) return v.map(String)
  const s = String(v)
  return s.includes(",") ? s.split(",").map((x) => x.trim()).filter(Boolean) : [s]
}
function intParam(v: unknown, def: number): number {
  const n = parseInt(String(v ?? ""), 10)
  return Number.isFinite(n) ? n : def
}
function placeholders(n: number): string {
  return Array(n).fill("?").join(",")
}

// ===================== REGIONS =====================
storeRouter.get("/regions", (_req, res) => {
  const rows = db.prepare("SELECT * FROM region ORDER BY name").all() as Row[]
  const regions = rows.map(serializeRegion)
  res.json({ regions, count: regions.length, offset: 0, limit: regions.length })
})
storeRouter.get("/regions/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM region WHERE id = ?").get(req.params.id) as Row | undefined
  if (!r) return res.status(404).json({ message: "Region not found" })
  res.json({ region: serializeRegion(r) })
})

// ===================== PRODUCTS =====================
storeRouter.get("/products", (req, res) => {
  const { id, handle, collection_id, category_id } = req.query
  const regionId = req.query.region_id as string | undefined
  const currency = regionId ? regionCurrency(regionId) : "usd"
  const limit = intParam(req.query.limit, 12)
  const offset = intParam(req.query.offset, 0)

  const where: string[] = ["p.status = 'published'"]
  const args: any[] = []

  const ids = toArray(id)
  if (ids) { where.push(`p.id IN (${placeholders(ids.length)})`); args.push(...ids) }
  if (handle) { where.push("p.handle = ?"); args.push(String(handle)) }
  const colIds = toArray(collection_id)
  if (colIds) { where.push(`p.collection_id IN (${placeholders(colIds.length)})`); args.push(...colIds) }
  const q = req.query.q as string | undefined
  if (q) { where.push("(p.title LIKE ? OR p.description LIKE ?)"); args.push(`%${q}%`, `%${q}%`) }

  let joinCat = ""
  const catIds = toArray(category_id)
  if (catIds) {
    joinCat = "JOIN product_category_product pcp ON pcp.product_id = p.id"
    where.push(`pcp.category_id IN (${placeholders(catIds.length)})`)
    args.push(...catIds)
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const total = (db.prepare(`SELECT COUNT(DISTINCT p.id) n FROM product p ${joinCat} ${whereSql}`).get(...args) as Row).n
  const rows = db.prepare(
    `SELECT DISTINCT p.* FROM product p ${joinCat} ${whereSql} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset) as Row[]

  res.json({
    products: rows.map((p) => serializeProduct(p, currency)),
    count: total, offset, limit,
  })
})
storeRouter.get("/products/:id", (req, res) => {
  const regionId = req.query.region_id as string | undefined
  const currency = regionId ? regionCurrency(regionId) : "usd"
  const p = db.prepare("SELECT * FROM product WHERE id = ? OR handle = ?").get(req.params.id, req.params.id) as Row | undefined
  if (!p) return res.status(404).json({ message: "Product not found" })
  res.json({ product: serializeProduct(p, currency) })
})

// ===================== COLLECTIONS =====================
storeRouter.get("/collections", (req, res) => {
  const handle = req.query.handle as string | undefined
  const limit = intParam(req.query.limit, 100)
  const offset = intParam(req.query.offset, 0)
  let rows: Row[]
  if (handle) {
    rows = db.prepare("SELECT * FROM collection WHERE handle = ?").all(handle) as Row[]
  } else {
    rows = db.prepare("SELECT * FROM collection ORDER BY title LIMIT ? OFFSET ?").all(limit, offset) as Row[]
  }
  const count = (db.prepare("SELECT COUNT(*) n FROM collection").get() as Row).n
  res.json({ collections: rows.map(serializeCollection), count, offset, limit })
})
storeRouter.get("/collections/:id", (req, res) => {
  const c = db.prepare("SELECT * FROM collection WHERE id = ? OR handle = ?").get(req.params.id, req.params.id) as Row | undefined
  if (!c) return res.status(404).json({ message: "Collection not found" })
  res.json({ collection: serializeCollection(c) })
})

// ===================== CATEGORIES =====================
storeRouter.get("/product-categories", (req, res) => {
  const handle = toArray(req.query.handle)
  const limit = intParam(req.query.limit, 100)
  const offset = intParam(req.query.offset, 0)
  let rows: Row[]
  if (handle) {
    rows = db.prepare(`SELECT * FROM category WHERE handle IN (${placeholders(handle.length)})`).all(...handle) as Row[]
  } else {
    rows = db.prepare("SELECT * FROM category WHERE is_active = 1 ORDER BY rank LIMIT ? OFFSET ?").all(limit, offset) as Row[]
  }
  const count = (db.prepare("SELECT COUNT(*) n FROM category WHERE is_active = 1").get() as Row).n
  res.json({ product_categories: rows.map((c) => serializeCategory(c)), count, offset, limit })
})
storeRouter.get("/product-categories/:id", (req, res) => {
  const c = db.prepare("SELECT * FROM category WHERE id = ? OR handle = ?").get(req.params.id, req.params.id) as Row | undefined
  if (!c) return res.status(404).json({ message: "Category not found" })
  res.json({ product_category: serializeCategory(c) })
})

// ===================== CART =====================
function priceForVariant(variantId: string, currency: string): number {
  const r = db.prepare("SELECT amount FROM price WHERE variant_id = ? AND currency_code = ?").get(variantId, currency.toLowerCase()) as Row | undefined
  return r ? Number(r.amount) : 0
}

storeRouter.post("/carts", (req, res) => {
  const regionId = req.body?.region_id as string | undefined
  const region = regionId
    ? (db.prepare("SELECT * FROM region WHERE id = ?").get(regionId) as Row | undefined)
    : (db.prepare("SELECT * FROM region ORDER BY name LIMIT 1").get() as Row | undefined)
  if (!region) return res.status(400).json({ message: "No region available" })
  const id = genId("cart")
  const ts = now()
  db.prepare(
    "INSERT INTO cart (id, region_id, currency_code, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, region.id, region.currency_code, req.body?.email ?? null, ts, ts)
  res.json({ cart: serializeCart(id) })
})

storeRouter.get("/carts/:id", (req, res) => {
  const cart = serializeCart(req.params.id)
  if (!cart) return res.status(404).json({ message: "Cart not found" })
  res.json({ cart })
})

storeRouter.post("/carts/:id", (req, res) => {
  const cart = db.prepare("SELECT * FROM cart WHERE id = ?").get(req.params.id) as Row | undefined
  if (!cart) return res.status(404).json({ message: "Cart not found" })
  const b = req.body || {}
  const ts = now()

  if (b.region_id && b.region_id !== cart.region_id) {
    const region = db.prepare("SELECT * FROM region WHERE id = ?").get(b.region_id) as Row | undefined
    if (region) {
      db.prepare("UPDATE cart SET region_id = ?, currency_code = ?, updated_at = ? WHERE id = ?")
        .run(region.id, region.currency_code, ts, cart.id)
      // Re-price existing line items into the new currency.
      const items = db.prepare("SELECT * FROM line_item WHERE cart_id = ?").all(cart.id) as Row[]
      for (const li of items) {
        if (li.variant_id) {
          db.prepare("UPDATE line_item SET unit_price = ? WHERE id = ?")
            .run(priceForVariant(li.variant_id, region.currency_code), li.id)
        }
      }
    }
  }
  if (b.email !== undefined) db.prepare("UPDATE cart SET email = ?, updated_at = ? WHERE id = ?").run(b.email, ts, cart.id)
  if (b.shipping_address !== undefined)
    db.prepare("UPDATE cart SET shipping_address = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(b.shipping_address), ts, cart.id)
  if (b.billing_address !== undefined)
    db.prepare("UPDATE cart SET billing_address = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(b.billing_address), ts, cart.id)
  if (b.promo_codes !== undefined)
    db.prepare("UPDATE cart SET promo_codes = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(b.promo_codes), ts, cart.id)

  res.json({ cart: serializeCart(cart.id) })
})

storeRouter.post("/carts/:id/line-items", (req, res) => {
  const cart = db.prepare("SELECT * FROM cart WHERE id = ?").get(req.params.id) as Row | undefined
  if (!cart) return res.status(404).json({ message: "Cart not found" })
  const { variant_id, quantity } = req.body || {}
  const variant = db.prepare("SELECT * FROM product_variant WHERE id = ?").get(variant_id) as Row | undefined
  if (!variant) return res.status(400).json({ message: "Variant not found" })
  const product = db.prepare("SELECT * FROM product WHERE id = ?").get(variant.product_id) as Row
  const ts = now()
  const qty = Math.max(1, intParam(quantity, 1))

  const existing = db.prepare("SELECT * FROM line_item WHERE cart_id = ? AND variant_id = ?").get(cart.id, variant_id) as Row | undefined
  if (existing) {
    db.prepare("UPDATE line_item SET quantity = quantity + ? WHERE id = ?").run(qty, existing.id)
  } else {
    db.prepare(
      `INSERT INTO line_item (id, cart_id, variant_id, product_id, product_title, product_handle, variant_title, variant_sku, title, thumbnail, quantity, unit_price, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      genId("li"), cart.id, variant.id, product.id, product.title, product.handle,
      variant.title, variant.sku, product.title, product.thumbnail, qty,
      priceForVariant(variant.id, cart.currency_code), ts
    )
  }
  res.json({ cart: serializeCart(cart.id) })
})

storeRouter.post("/carts/:id/line-items/:lineId", (req, res) => {
  const cart = db.prepare("SELECT * FROM cart WHERE id = ?").get(req.params.id) as Row | undefined
  if (!cart) return res.status(404).json({ message: "Cart not found" })
  const qty = intParam(req.body?.quantity, 1)
  if (qty <= 0) {
    db.prepare("DELETE FROM line_item WHERE id = ? AND cart_id = ?").run(req.params.lineId, cart.id)
  } else {
    db.prepare("UPDATE line_item SET quantity = ? WHERE id = ? AND cart_id = ?").run(qty, req.params.lineId, cart.id)
  }
  res.json({ cart: serializeCart(cart.id) })
})

storeRouter.delete("/carts/:id/line-items/:lineId", (req, res) => {
  db.prepare("DELETE FROM line_item WHERE id = ? AND cart_id = ?").run(req.params.lineId, req.params.id)
  res.json({ id: req.params.lineId, object: "line-item", deleted: true, parent: serializeCart(req.params.id) })
})

storeRouter.post("/carts/:id/shipping-methods", (req, res) => {
  const cart = db.prepare("SELECT * FROM cart WHERE id = ?").get(req.params.id) as Row | undefined
  if (!cart) return res.status(404).json({ message: "Cart not found" })
  const optId = req.body?.option_id
  const opt = db.prepare("SELECT * FROM shipping_option WHERE id = ?").get(optId) as Row | undefined
  if (!opt) return res.status(400).json({ message: "Shipping option not found" })
  // One shipping method per cart for this light backend.
  db.prepare("DELETE FROM shipping_method WHERE cart_id = ?").run(cart.id)
  db.prepare(
    "INSERT INTO shipping_method (id, cart_id, shipping_option_id, name, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(genId("sm"), cart.id, opt.id, opt.name, opt.amount, now())
  res.json({ cart: serializeCart(cart.id) })
})

storeRouter.post("/carts/:id/complete", (req, res) => {
  const result = completeCart(req.params.id, { provider_id: "manual", status: "captured" })
  if (result.type === "order") {
    return res.json({ type: "order", order: serializeOrder(result.orderId) })
  }
  res.json({ type: "cart", cart: serializeCart(req.params.id), error: { message: result.error } })
})

// ===================== SHIPPING OPTIONS =====================
storeRouter.get("/shipping-options", (req, res) => {
  const cartId = req.query.cart_id as string | undefined
  let regionId: string | undefined
  if (cartId) {
    const cart = db.prepare("SELECT region_id FROM cart WHERE id = ?").get(cartId) as Row | undefined
    regionId = cart?.region_id
  }
  const rows = regionId
    ? (db.prepare("SELECT * FROM shipping_option WHERE region_id = ? OR region_id IS NULL").all(regionId) as Row[])
    : (db.prepare("SELECT * FROM shipping_option").all() as Row[])
  res.json({ shipping_options: rows.map(serializeShippingOption) })
})

// ===================== PAYMENT =====================
storeRouter.get("/payment-providers", (req, res) => {
  const regionId = req.query.region_id as string | undefined
  let rows: Row[]
  if (regionId) {
    rows = db.prepare("SELECT provider_id AS id FROM region_payment_provider WHERE region_id = ?").all(regionId) as Row[]
  } else {
    rows = db.prepare("SELECT id FROM payment_provider WHERE is_enabled = 1").all() as Row[]
  }
  res.json({ payment_providers: rows.map((r) => ({ id: r.id, is_enabled: true })) })
})

// Create (or return existing) payment collection for a cart.
storeRouter.post("/payment-collections", (req, res) => {
  const cartId = req.body?.cart_id as string | undefined
  const cart = cartId ? (db.prepare("SELECT * FROM cart WHERE id = ?").get(cartId) as Row | undefined) : undefined
  if (!cart) return res.status(400).json({ message: "Cart not found" })
  let pc = db.prepare("SELECT * FROM payment_collection WHERE cart_id = ?").get(cartId) as Row | undefined
  const serialized = serializeCart(cart.id)
  const ts = now()
  if (!pc) {
    const id = genId("paycol")
    db.prepare(
      "INSERT INTO payment_collection (id, cart_id, amount, currency_code, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'not_paid', ?, ?)"
    ).run(id, cart.id, serialized.total, cart.currency_code, ts, ts)
    pc = db.prepare("SELECT * FROM payment_collection WHERE id = ?").get(id) as Row
  } else {
    db.prepare("UPDATE payment_collection SET amount = ?, updated_at = ? WHERE id = ?").run(serialized.total, ts, pc.id)
  }
  res.json({ payment_collection: { id: pc.id, amount: serialized.total, currency_code: cart.currency_code, status: pc.status, payment_sessions: [] } })
})

// Create a payment session for a provider (the storefront's initiatePaymentSession).
storeRouter.post("/payment-collections/:id/payment-sessions", (req, res) => {
  const pc = db.prepare("SELECT * FROM payment_collection WHERE id = ?").get(req.params.id) as Row | undefined
  if (!pc) return res.status(404).json({ message: "Payment collection not found" })
  const providerId = req.body?.provider_id as string
  const cart = db.prepare("SELECT * FROM cart WHERE id = ?").get(pc.cart_id) as Row
  const totals = serializeCart(cart.id)
  const ts = now()

  // Keep a single active session: clear previous ones on this collection.
  db.prepare("DELETE FROM payment_session WHERE payment_collection_id = ?").run(pc.id)

  let data: Record<string, unknown> = {}
  if (providerId === PROVIDER_RINGGITPAY) {
    const customer = cart.customer_id ? (db.prepare("SELECT * FROM customer WHERE id = ?").get(cart.customer_id) as Row | undefined) : undefined
    const ship = parseJSON<Row>(cart.shipping_address, {} as Row)
    const name = [customer?.first_name || ship.first_name, customer?.last_name || ship.last_name].filter(Boolean).join(" ")
    data = buildRinggitPaySession({
      cartId: cart.id,
      orderId: genOrderRef(), // short, gateway-compliant ref; webhook maps it back via data.orderId
      amount: totals.total,
      currency: cart.currency_code,
      email: cart.email || customer?.email,
      customerName: name,
    })
  }

  const sid = genId("paysess")
  db.prepare(
    "INSERT INTO payment_session (id, payment_collection_id, provider_id, status, amount, currency_code, data, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)"
  ).run(sid, pc.id, providerId, totals.total, cart.currency_code, JSON.stringify(data), ts, ts)

  // Audit: record the exact request the storefront will POST to RinggitPay.
  if (providerId === PROVIDER_RINGGITPAY) {
    logRinggitPay({
      direction: "out", kind: "initiate",
      orderId: (data as Row).orderId as string, cartId: cart.id, sessionId: sid,
      endpoint: (data as Row).payment_url as string, payload: data,
    })
  }

  res.json({
    payment_collection: {
      id: pc.id,
      amount: totals.total,
      currency_code: cart.currency_code,
      status: pc.status,
      payment_sessions: [
        { id: sid, provider_id: providerId, status: "pending", amount: totals.total, currency_code: cart.currency_code, data, payment_collection_id: pc.id, created_at: ts },
      ],
    },
  })
})

// ===================== ORDERS =====================
storeRouter.get("/orders", requireCustomer, (req, res) => {
  const limit = intParam(req.query.limit, 10)
  const offset = intParam(req.query.offset, 0)
  const customerId = req.auth!.actor_id
  const rows = db.prepare(
    'SELECT id FROM "order" WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(customerId, limit, offset) as Row[]
  const count = (db.prepare('SELECT COUNT(*) n FROM "order" WHERE customer_id = ?').get(customerId) as Row).n
  res.json({ orders: rows.map((r) => serializeOrder(r.id)), count, offset, limit })
})
storeRouter.get("/orders/:id", (req, res) => {
  const order = serializeOrder(req.params.id)
  if (!order) return res.status(404).json({ message: "Order not found" })
  res.json({ order })
})

// ===================== CUSTOMERS =====================
storeRouter.get("/customers/me", requireCustomer, (req, res) => {
  const c = db.prepare("SELECT * FROM customer WHERE id = ?").get(req.auth!.actor_id) as Row | undefined
  if (!c) return res.status(404).json({ message: "Customer not found" })
  res.json({ customer: serializeCustomer(c) })
})

// Create a customer (called with a registration token after /auth/.../register).
storeRouter.post("/customers", requireCustomerToken, (req, res) => {
  const b = req.body || {}
  const authId = req.auth!.auth_identity_id
  const identity = db.prepare("SELECT * FROM auth_identity WHERE id = ?").get(authId) as Row | undefined
  if (!identity) return res.status(401).json({ message: "Invalid registration token" })

  // If the identity already has a customer, return it.
  if (identity.actor_id) {
    const existing = db.prepare("SELECT * FROM customer WHERE id = ?").get(identity.actor_id) as Row | undefined
    if (existing) return res.json({ customer: serializeCustomer(existing) })
  }

  const ts = now()
  const id = genId("cus")
  db.prepare(
    "INSERT INTO customer (id, email, first_name, last_name, phone, has_account, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
  ).run(id, b.email || identity.email, b.first_name ?? null, b.last_name ?? null, b.phone ?? null, ts, ts)
  db.prepare("UPDATE auth_identity SET actor_id = ? WHERE id = ?").run(id, authId)
  res.json({ customer: serializeCustomer(db.prepare("SELECT * FROM customer WHERE id = ?").get(id) as Row) })
})

storeRouter.post("/customers/me", requireCustomer, (req, res) => {
  const b = req.body || {}
  const ts = now()
  const fields = ["first_name", "last_name", "phone", "company_name", "email"]
  for (const f of fields) {
    if (b[f] !== undefined) db.prepare(`UPDATE customer SET ${f} = ?, updated_at = ? WHERE id = ?`).run(b[f], ts, req.auth!.actor_id)
  }
  res.json({ customer: serializeCustomer(db.prepare("SELECT * FROM customer WHERE id = ?").get(req.auth!.actor_id) as Row) })
})

storeRouter.post("/customers/me/addresses", requireCustomer, (req, res) => {
  const b = req.body || {}
  const ts = now()
  db.prepare(
    `INSERT INTO customer_address (id, customer_id, first_name, last_name, company, address_1, address_2, city, province, postal_code, country_code, phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    genId("caddr"), req.auth!.actor_id, b.first_name, b.last_name, b.company, b.address_1, b.address_2,
    b.city, b.province, b.postal_code, b.country_code, b.phone, ts, ts
  )
  res.json({ customer: serializeCustomer(db.prepare("SELECT * FROM customer WHERE id = ?").get(req.auth!.actor_id) as Row) })
})

storeRouter.post("/customers/me/addresses/:addressId", requireCustomer, (req, res) => {
  const b = req.body || {}
  const ts = now()
  const fields = ["first_name", "last_name", "company", "address_1", "address_2", "city", "province", "postal_code", "country_code", "phone"]
  for (const f of fields) {
    if (b[f] !== undefined) db.prepare(`UPDATE customer_address SET ${f} = ?, updated_at = ? WHERE id = ? AND customer_id = ?`).run(b[f], ts, req.params.addressId, req.auth!.actor_id)
  }
  res.json({ customer: serializeCustomer(db.prepare("SELECT * FROM customer WHERE id = ?").get(req.auth!.actor_id) as Row) })
})

storeRouter.delete("/customers/me/addresses/:addressId", requireCustomer, (req, res) => {
  db.prepare("DELETE FROM customer_address WHERE id = ? AND customer_id = ?").run(req.params.addressId, req.auth!.actor_id)
  res.json({ customer: serializeCustomer(db.prepare("SELECT * FROM customer WHERE id = ?").get(req.auth!.actor_id) as Row) })
})
