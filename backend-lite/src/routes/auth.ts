import { Router } from "express"
import { db, genId, now, hashPassword, verifyPassword } from "../db.js"
import { signToken } from "../auth.js"

type Row = Record<string, any>
export const authRouter = Router()

const VALID_ACTORS = new Set(["customer", "user"])

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
  const identity = db.prepare("SELECT * FROM auth_identity WHERE email = ? AND actor_type = ?").get(email, actor) as Row | undefined
  if (!identity || !verifyPassword(password || "", identity.password_hash)) {
    return res.status(401).json({ type: "unauthorized", message: "Invalid email or password" })
  }
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
