import { db, genId, now, nextCounter } from "./db.js"
import { computeItemsSubtotal } from "./serialize.js"

type Row = Record<string, any>

/**
 * Turns a cart into an order (idempotent). Mirrors Medusa's completeCartWorkflow
 * closely enough for the storefront: snapshots line items + shipping methods,
 * records a payment, and stamps cart.completed_at.
 */
export function completeCart(
  cartId: string,
  payment?: { provider_id: string; status?: string; data?: unknown }
): { type: "order"; orderId: string } | { type: "cart"; error: string } {
  const cart = db.prepare("SELECT * FROM cart WHERE id = ?").get(cartId) as Row | undefined
  if (!cart) return { type: "cart", error: "Cart not found" }

  // Idempotency: if already completed, return the existing order.
  if (cart.completed_at) {
    const existing = db.prepare('SELECT id FROM "order" WHERE cart_id = ?').get(cartId) as Row | undefined
    if (existing) return { type: "order", orderId: existing.id }
  }

  const items = db.prepare("SELECT * FROM line_item WHERE cart_id = ?").all(cartId) as Row[]
  if (items.length === 0) return { type: "cart", error: "Cart is empty" }
  // Customer details are optional: an order is created with whatever the cart has
  // (email / shipping address may be absent).

  const ts = now()
  const orderId = genId("order")
  const displayId = nextCounter("order_display_id")
  const shipMethods = db.prepare("SELECT * FROM shipping_method WHERE cart_id = ?").all(cartId) as Row[]
  const subtotal = computeItemsSubtotal(items.map((i) => ({ unit_price: i.unit_price, quantity: i.quantity })))
  const shipping = shipMethods.reduce((a, m) => a + Number(m.amount), 0)
  const total = subtotal + shipping

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO "order" (id, display_id, cart_id, region_id, customer_id, email, currency_code, status, payment_status, fulfillment_status, shipping_address, billing_address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'not_fulfilled', ?, ?, ?, ?)`
    ).run(
      orderId,
      displayId,
      cartId,
      cart.region_id,
      cart.customer_id,
      cart.email,
      cart.currency_code,
      payment?.status === "captured" ? "captured" : "authorized",
      cart.shipping_address,
      cart.billing_address || cart.shipping_address,
      ts,
      ts
    )

    // Move line item + shipping method snapshots onto the order.
    for (const li of items) {
      db.prepare(
        `INSERT INTO line_item (id, order_id, variant_id, product_id, product_title, product_handle, variant_title, variant_sku, title, thumbnail, quantity, unit_price, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        genId("ordli"), orderId, li.variant_id, li.product_id, li.product_title, li.product_handle,
        li.variant_title, li.variant_sku, li.title, li.thumbnail, li.quantity, li.unit_price, li.metadata, ts
      )
    }
    for (const m of shipMethods) {
      db.prepare(
        "INSERT INTO shipping_method (id, order_id, shipping_option_id, name, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(genId("ordsm"), orderId, m.shipping_option_id, m.name, m.amount, ts)
    }

    db.prepare(
      "INSERT INTO order_payment (id, order_id, provider_id, amount, currency_code, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      genId("pay"), orderId, payment?.provider_id || "manual", total, cart.currency_code,
      payment?.status === "captured" ? "captured" : "authorized",
      payment?.data ? JSON.stringify(payment.data) : null, ts
    )

    db.prepare("UPDATE cart SET completed_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, cartId)
  })
  tx()

  return { type: "order", orderId }
}
