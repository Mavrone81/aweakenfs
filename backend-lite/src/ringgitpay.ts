import crypto from "node:crypto"
import { config } from "./config.js"
import { logRinggitPay } from "./rplog.js"

const baseUrl = () =>
  config.ringgitpay.isSandbox
    ? "https://ringgitpay.co/payment"
    : "https://ringgitpay.com/payment"

function sha256Upper(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase()
}

/** Country code RinggitPay redirects to, derived from currency. */
function countryForCurrency(currency: string): string {
  const c = currency.toLowerCase()
  if (c === "myr") return "my"
  if (c === "sgd") return "sg"
  return "my"
}

/**
 * RinggitPay limits `orderId` to 20 chars (type C). The Medusa `cart_*` id is
 * 31 chars, which the gateway rejects ("Invalid OrderId format") — so we send a
 * short, gateway-compliant reference instead and map it back to the cart via the
 * payment session's stored `data.orderId` (see routes/webhooks.ts).
 */
export const RINGGITPAY_ORDER_ID_MAX = 20

/** Generates a short (18-char), alphanumeric, RinggitPay-compliant order reference. */
export function genOrderRef(): string {
  return "RP" + crypto.randomBytes(8).toString("hex").toUpperCase() // "RP" + 16 hex = 18 chars
}

/**
 * Builds the `data` object stored on the payment session. The storefront's
 * RinggitPayPaymentButton reads these exact keys and POSTs them to payment_url.
 * Mirrors backend/src/modules/ringgitpay/service.ts initiatePayment().
 *
 * `orderId` is the short gateway reference (<= 20 chars); `cartId` is the Medusa
 * cart id, used only for the storefront return URL.
 */
export function buildRinggitPaySession(params: {
  cartId: string
  orderId: string
  amount: number
  currency: string
  email?: string | null
  customerName?: string | null
}) {
  const { cartId, orderId, amount, currency, email, customerName } = params
  if (!orderId || orderId.length > RINGGITPAY_ORDER_ID_MAX) {
    throw new Error(
      `RinggitPay orderId must be 1-${RINGGITPAY_ORDER_ID_MAX} chars, got ${orderId?.length ?? 0} ("${orderId}")`
    )
  }
  const amountString = Number(amount).toFixed(2)
  const cur = currency.toUpperCase()

  const checkSum = sha256Upper(
    `${config.ringgitpay.appId}|${cur}|${amountString}|${orderId}|${config.ringgitpay.requestKey}`
  )

  const countryCode = countryForCurrency(currency)
  // Return the shopper's browser to the BACKEND so we can verify + persist the
  // outcome (RinggitPay does NOT fire the server webhook on cancel/fail — only on
  // success). The backend route updates the session, then 303-redirects to the
  // storefront success/failed page. nginx routes /api/webhooks/ -> backend.
  const returnURL = `${config.backendUrl}/api/webhooks/ringgitpay/return?countryCode=${countryCode}&cart_id=${cartId}`

  return {
    appId: config.ringgitpay.appId,
    currency: cur,
    amount: amountString,
    orderId,
    checkSum,
    returnURL: encodeURIComponent(returnURL),
    buyerEmail: email || "",
    accName: customerName || "Customer",
    payment_url: baseUrl(),
  }
}

export type RinggitPayWebhook = {
  rp_appId?: string
  rp_currency?: string
  rp_amount?: string
  rp_statusCode?: string
  rp_orderId?: string
  rp_transactionRef?: string
  rp_checkSum?: string
  [k: string]: unknown
}

export function verifyWebhookChecksum(p: RinggitPayWebhook): boolean {
  const source = `${p.rp_appId}|${p.rp_currency}|${p.rp_amount}|${p.rp_statusCode}|${p.rp_orderId}|${p.rp_transactionRef}|${config.ringgitpay.responseKey}`
  return sha256Upper(source) === p.rp_checkSum
}

/** Maps a RinggitPay status code to a payment-session status. */
export function mapStatus(statusCode: string): "captured" | "pending" | "canceled" {
  if (statusCode === "RP00") return "captured"
  if (statusCode === "RP09") return "pending"
  return "canceled"
}

// ---- Transaction Enquiry API (guide v1.19, §7-8) ----
// Lets us poll RinggitPay for the authoritative status of a transaction. Used by
// the reconcile job to resolve sessions left dangling at `pending` (e.g. the
// shopper never returned, or the redirect was lost).

const enquiryUrl = () =>
  config.ringgitpay.isSandbox
    ? "https://ringgitpay.co/transactionenquiry"
    : "https://ringgitpay.com/transactionenquiry"

export type RinggitPayEnquiryResponse = {
  rp_appId?: string
  rp_currency?: string
  rp_amount?: string
  rp_statusCode?: string
  rp_orderId?: string
  rp_transactionRef?: string
  rp_paymentMode?: string
  rp_txnTime?: string
  rp_remarks?: string | null
  rp_checkSum?: string
  [k: string]: unknown
}

/**
 * Builds the signed enquiry request body. Request checksum (guide §7.4):
 *   sha256Upper(appId|orderId|transactionRef|REQUESTKEY)   — empty middle if no ref.
 */
export function buildEnquiryRequest(orderId: string, transactionRef?: string | null) {
  const ref = transactionRef || ""
  const checkSum = sha256Upper(
    `${config.ringgitpay.appId}|${orderId}|${ref}|${config.ringgitpay.requestKey}`
  )
  const body: Record<string, string> = { appId: config.ringgitpay.appId, orderId, checkSum }
  if (ref) body.transactionRef = ref
  return body
}

/**
 * POSTs an enquiry and returns the parsed response (JSON, with NVP fallback), or
 * null on transport error. Does NOT verify the checksum — callers must validate
 * with `verifyWebhookChecksum` (same source-string formula as the response, §8.3).
 */
export async function enquireTransaction(
  orderId: string,
  transactionRef?: string | null
): Promise<RinggitPayEnquiryResponse | null> {
  const url = enquiryUrl()
  const body = buildEnquiryRequest(orderId, transactionRef)
  logRinggitPay({ direction: "out", kind: "enquiry_request", orderId, endpoint: url, payload: body })

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error(`⚠️ RinggitPay enquiry transport error for ${orderId}:`, (err as Error).message)
    return null
  }
  const text = await res.text()
  let resp: RinggitPayEnquiryResponse | null
  try {
    resp = JSON.parse(text) as RinggitPayEnquiryResponse
  } catch {
    const out: RinggitPayEnquiryResponse = {}
    for (const kv of text.split("&")) {
      const i = kv.indexOf("=")
      if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "))
    }
    resp = out.rp_statusCode ? out : null
  }
  logRinggitPay({
    direction: "in", kind: "enquiry_response", orderId,
    statusCode: resp?.rp_statusCode ?? null,
    payload: resp ?? { http: res.status, raw: text.slice(0, 500) },
  })
  return resp
}
