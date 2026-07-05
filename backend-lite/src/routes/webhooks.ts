import { Router } from "express"
import { db } from "../db.js"
import { verifyWebhookChecksum, mapStatus, type RinggitPayWebhook } from "../ringgitpay.js"
import { completeCart } from "../complete.js"
import { config, PROVIDER_RINGGITPAY } from "../config.js"
import { logRinggitPay } from "../rplog.js"

type Row = Record<string, any>
export const webhookRouter = Router()

/**
 * Core handler for any RinggitPay response payload (server webhook OR browser
 * return). Verifies the checksum, resolves the cart + payment session, updates
 * the session status, and — on success — completes the cart into an order.
 *
 * Returns the resolved cart id and mapped status so the caller can decide how to
 * respond (200-ack for the webhook, browser redirect for the return URL).
 */
export function applyRinggitPayResult(
  body: RinggitPayWebhook
): { ok: boolean; cartId?: string; mapped?: "captured" | "pending" | "canceled" } {
  if (!verifyWebhookChecksum(body)) {
    console.warn("⚠️ RinggitPay checksum mismatch — ignoring")
    return { ok: false }
  }

  const statusCode = String(body.rp_statusCode || "")
  const mapped = mapStatus(statusCode) // captured | pending | canceled
  const referenceId = String(body.rp_orderId || "") // short gateway ref stored on session.data.orderId
  if (!referenceId) return { ok: false }

  let cartId: string | undefined
  let session: Row | undefined

  // Primary: the orderId we sent is a short ref stored on payment_session.data.orderId.
  session = db.prepare(
    "SELECT * FROM payment_session WHERE json_extract(data, '$.orderId') = ? AND provider_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(referenceId, PROVIDER_RINGGITPAY) as Row | undefined
  if (session) {
    const pc = db.prepare("SELECT cart_id FROM payment_collection WHERE id = ?").get(session.payment_collection_id) as Row | undefined
    cartId = pc?.cart_id
  } else if (referenceId.startsWith("cart_")) {
    // Legacy: older sessions used the full cart id as the orderId.
    cartId = referenceId
    const pc = db.prepare("SELECT * FROM payment_collection WHERE cart_id = ?").get(cartId) as Row | undefined
    if (pc) {
      session = db.prepare(
        "SELECT * FROM payment_session WHERE payment_collection_id = ? AND provider_id = ?"
      ).get(pc.id, PROVIDER_RINGGITPAY) as Row | undefined
    }
  } else if (referenceId.startsWith("paysess_")) {
    // Legacy: older sessions used the payment-session id as the orderId.
    session = db.prepare("SELECT * FROM payment_session WHERE id = ?").get(referenceId) as Row | undefined
    if (session) {
      const pc = db.prepare("SELECT cart_id FROM payment_collection WHERE id = ?").get(session.payment_collection_id) as Row | undefined
      cartId = pc?.cart_id
    }
  }

  const sessionStatus = mapped === "captured" ? "captured" : mapped === "pending" ? "pending" : "canceled"
  if (session) {
    // Don't clobber a terminal state with a later, weaker signal.
    if (session.status !== "captured" || sessionStatus === "captured") {
      db.prepare("UPDATE payment_session SET status = ?, data = ?, updated_at = ? WHERE id = ?")
        .run(sessionStatus, JSON.stringify({ ...JSON.parse(session.data || "{}"), webhook: body }), new Date().toISOString(), session.id)
    }
  }

  if (mapped === "captured" && cartId) {
    const cart = db.prepare("SELECT completed_at FROM cart WHERE id = ?").get(cartId) as Row | undefined
    if (cart && !cart.completed_at) {
      const result = completeCart(cartId, { provider_id: PROVIDER_RINGGITPAY, status: "captured", data: body })
      if (result.type === "order") console.log(`✅ Order created for cart ${cartId}: ${result.orderId}`)
      else console.warn(`⚠️ Could not complete cart ${cartId}: ${result.error}`)
    }
  }

  return { ok: true, cartId, mapped }
}

/**
 * POST /api/webhooks/ringgitpay
 * Server-to-server callback (fires on success). Verifies + completes; always 200-acks.
 */
webhookRouter.post("/ringgitpay", (req, res) => {
  try {
    const body = (req.body || {}) as RinggitPayWebhook
    console.log("⟵ RinggitPay webhook:", JSON.stringify(body))
    logRinggitPay({ direction: "in", kind: "webhook", orderId: String(body.rp_orderId || "") || null, statusCode: String(body.rp_statusCode || "") || null, payload: body })
    applyRinggitPayResult(body)
    res.status(200).json({ received: true })
  } catch (err: any) {
    console.error("🔥 RinggitPay webhook error:", err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST|GET /api/webhooks/ringgitpay/return
 * The shopper's browser is redirected here by RinggitPay (the payment returnURL).
 * Unlike the server webhook, this fires for cancel/fail too — so it's where we
 * persist those outcomes. After updating, we 303-redirect to the storefront
 * success/failed page (mirrors the old storefront callback UX).
 */
function handleReturn(req: import("express").Request, res: import("express").Response) {
  const body = ({ ...(req.body || {}), ...(req.query || {}) }) as RinggitPayWebhook & Record<string, any>
  console.log("⟵ RinggitPay browser return:", JSON.stringify(body))
  logRinggitPay({
    direction: "in", kind: "return",
    orderId: String(body.rp_orderId || "") || null,
    cartId: String(body.cart_id || "") || null,
    statusCode: String(body.rp_statusCode || "") || null,
    payload: body,
  })

  try {
    applyRinggitPayResult(body as RinggitPayWebhook)
  } catch (err: any) {
    console.error("🔥 RinggitPay return error:", err)
  }

  const countryCode = String(req.query.countryCode || body.countryCode || "my")
  const statusCode = String(body.rp_statusCode || "")
  const transactionId = String(body.rp_transactionRef || "")
  const orderId = String(body.rp_orderId || "")
  const amount = String(body.rp_amount || "")
  const reason = String(body.rp_statusMsg || body.rp_remarks || "")
  const base = config.storeUrl

  if (statusCode === "RP00") {
    const u = new URL(`${base}/${countryCode}/ringgitpay/success`)
    u.searchParams.set("transactionId", transactionId)
    u.searchParams.set("orderId", orderId)
    u.searchParams.set("amount", amount)
    return res.redirect(303, u.toString())
  }
  const u = new URL(`${base}/${countryCode}/ringgitpay/failed`)
  u.searchParams.set("reason", reason)
  u.searchParams.set("statusCode", statusCode)
  u.searchParams.set("transactionId", transactionId)
  u.searchParams.set("orderId", orderId)
  return res.redirect(303, u.toString())
}

webhookRouter.post("/ringgitpay/return", handleReturn)
webhookRouter.get("/ringgitpay/return", handleReturn)
