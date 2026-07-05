import { db, genId, now } from "./db.js"

type Row = Record<string, any>

export type RinggitPayLogEntry = {
  direction: "out" | "in"
  kind: "initiate" | "enquiry_request" | "enquiry_response" | "webhook" | "return"
  orderId?: string | null
  cartId?: string | null
  sessionId?: string | null
  statusCode?: string | null
  endpoint?: string | null
  payload: unknown
}

/**
 * Append one row to the RinggitPay audit trail. Best-effort: never throws, so a
 * logging failure can't break a payment flow.
 */
export function logRinggitPay(e: RinggitPayLogEntry): void {
  try {
    db.prepare(
      `INSERT INTO ringgitpay_log (id, created_at, direction, kind, order_id, cart_id, session_id, status_code, endpoint, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      genId("rplog"), now(), e.direction, e.kind,
      e.orderId ?? null, e.cartId ?? null, e.sessionId ?? null,
      e.statusCode ?? null, e.endpoint ?? null,
      typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload)
    )
  } catch (err) {
    console.error("⚠️ ringgitpay_log write failed:", (err as Error).message)
  }
}

/** Read the audit trail, newest first. Optionally filter by orderId. */
export function getRinggitPayLogs(opts: { orderId?: string; limit?: number } = {}): Row[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000)
  const rows = opts.orderId
    ? db.prepare("SELECT * FROM ringgitpay_log WHERE order_id = ? ORDER BY created_at DESC LIMIT ?").all(opts.orderId, limit)
    : db.prepare("SELECT * FROM ringgitpay_log ORDER BY created_at DESC LIMIT ?").all(limit)
  return (rows as Row[]).map((r) => ({ ...r, payload: safeParse(r.payload) }))
}

function safeParse(v: unknown): unknown {
  if (typeof v !== "string") return v
  try { return JSON.parse(v) } catch { return v }
}
