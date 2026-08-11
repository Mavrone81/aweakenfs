import { Router } from "express"
import { db, genId, now, hashPassword, verifyPassword } from "../db.js"
import { signToken } from "../auth.js"
import { createLoginThrottle } from "../login-throttle.js"

type Row = Record<string, any>
export const authRouter = Router()

const VALID_ACTORS = new Set(["customer", "user"])

// 5 failed logins per (actor, email, IP) per 15 minutes.
const loginThrottle = createLoginThrottle()

// The caller's address.
//
// Deliberately NOT the first X-Forwarded-For entry: nginx builds that header
// with $proxy_add_x_forwarded_for, which APPENDS the real peer to whatever the
// client already sent, so the first entry is attacker-supplied and a throttle
// keyed on it can be walked straight through with a fresh fake address per
// request. X-Real-IP is set by nginx with proxy_set_header, which REPLACES any
// client value; the last X-Forwarded-For entry is the fallback, being the one
// the trusted proxy appended. The app port is published on loopback only, so
// nginx is the sole path in and neither header can be set from outside.
function clientIp(req: { headers: Record<string, any>; ip?: string }): string {
  const realIp = String(req.headers["x-real-ip"] ?? "").trim()
  if (realIp) return realIp
  const parts = String(req.headers["x-forwarded-for"] ?? "")
    .split(",").map((v) => v.trim()).filter(Boolean)
  if (parts.length) return parts[parts.length - 1]
  return req.ip || "unknown"
}

// POST /auth/:actor/:provider/register  -> { token }
authRouter.post("/:actor/:provider/register", (req, res) => {
  const actor = req.params.actor
  if (!VALID_ACTORS.has(actor)) return res.status(400).json({ message: "Invalid actor type" })
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ message: "email and password are required" })

  const existing = db.prepare("SELECT * FROM auth_identity WHERE email = ? AND actor_type = ?").get(email, actor) as Row | undefined
  if (existing) {
    return res.status(401).json({ type: "unauthorized", message: "Identity with email already exists" })
  }

  const id = genId("authid")
  db.prepare(
    "INSERT INTO auth_identity (id, email, password_hash, actor_type, actor_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
  ).run(id, email, hashPassword(password), actor, now())

  const token = signToken({ actor_id: "", actor_type: actor as any, auth_identity_id: id })
  res.json({ token })
})

// POST /auth/:actor/:provider  (login) -> { token }
authRouter.post("/:actor/:provider", (req, res) => {
  const actor = req.params.actor
  if (!VALID_ACTORS.has(actor)) return res.status(400).json({ message: "Invalid actor type" })
  const { email, password } = req.body || {}

  loginThrottle.sweep()
  const throttleKey = loginThrottle.key(actor, email, clientIp(req))
  if (loginThrottle.blocked(throttleKey)) {
    return res.status(429).json({ type: "rate_limited", message: "Too many failed attempts. Please try again in 15 minutes." })
  }

  const identity = db.prepare("SELECT * FROM auth_identity WHERE email = ? AND actor_type = ?").get(email, actor) as Row | undefined
  if (!identity || !verifyPassword(password || "", identity.password_hash)) {
    // Counted for unknown addresses too, so the throttle cannot be sidestepped
    // by guessing accounts that do not exist.
    loginThrottle.fail(throttleKey)
    return res.status(401).json({ type: "unauthorized", message: "Invalid email or password" })
  }
  loginThrottle.clear(throttleKey)
  const token = signToken({
    actor_id: identity.actor_id || "",
    actor_type: actor as any,
    auth_identity_id: identity.id,
  })
  res.json({ token })
})

// DELETE /auth/session  (logout)
authRouter.delete("/session", (_req, res) => {
  res.status(200).json({ success: true })
})
