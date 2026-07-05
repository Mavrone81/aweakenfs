import { db } from "./db.js"
import { PROVIDER_RINGGITPAY } from "./config.js"
import {
  enquireTransaction,
  verifyWebhookChecksum,
  mapStatus,
  type RinggitPayEnquiryResponse,
} from "./ringgitpay.js"
import { applyRinggitPayResult } from "./routes/webhooks.js"

type Row = Record<string, any>

export type ReconcileItem = {
  session: string
  orderId?: string
  statusCode?: string
  mapped?: string
  action: string
  cartId?: string
}

/**
 * Polls RinggitPay's Transaction Enquiry API for every RinggitPay payment session
 * still stuck at `pending`, and resolves it to its authoritative status. This is
 * the safety net for outcomes the browser-return never delivered (lost redirect,
 * shopper closed the tab, network blip). Captured transactions also complete the
 * cart into an order via the shared `applyRinggitPayResult`.
 *
 * Only acts on checksum-verified responses; leaves genuinely-pending (RP09) and
 * unverifiable (e.g. not-found) responses untouched.
 */
export async function reconcilePendingRinggitPay(): Promise<{ checked: number; items: ReconcileItem[] }> {
  const sessions = db.prepare(
    "SELECT id, data FROM payment_session WHERE provider_id = ? AND status = 'pending'"
  ).all(PROVIDER_RINGGITPAY) as Row[]

  const items: ReconcileItem[] = []
  for (const s of sessions) {
    let data: Row = {}
    try { data = JSON.parse(s.data || "{}") } catch { /* ignore */ }
    const orderId: string | undefined = data.orderId
    if (!orderId) { items.push({ session: s.id, action: "skipped: no orderId" }); continue }

    const txnRef: string | null = data.webhook?.rp_transactionRef || null
    const resp = (await enquireTransaction(orderId, txnRef)) as RinggitPayEnquiryResponse | null
    if (!resp || !resp.rp_statusCode) {
      items.push({ session: s.id, orderId, action: "skipped: no/empty response" })
      continue
    }
    if (!verifyWebhookChecksum(resp)) {
      items.push({ session: s.id, orderId, statusCode: resp.rp_statusCode, action: "skipped: checksum invalid (no record?)" })
      continue
    }

    const mapped = mapStatus(resp.rp_statusCode)
    if (mapped === "pending") {
      items.push({ session: s.id, orderId, statusCode: resp.rp_statusCode, mapped, action: "still pending" })
      continue
    }

    const r = applyRinggitPayResult(resp)
    items.push({
      session: s.id, orderId, statusCode: resp.rp_statusCode, mapped,
      action: r.ok ? `resolved -> ${mapped}` : "verify failed",
      cartId: r.cartId,
    })
  }

  if (items.length) console.log(`🔄 RinggitPay reconcile: checked ${sessions.length}`, JSON.stringify(items))
  return { checked: sessions.length, items }
}
