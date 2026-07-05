import jwt from "jsonwebtoken"
import type { Request, Response, NextFunction } from "express"
import { config } from "./config.js"

export type AuthPayload = {
  actor_id: string // "" for a registration token with no customer yet
  actor_type: "customer" | "user"
  auth_identity_id: string
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" })
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as AuthPayload
  } catch {
    return null
  }
}

function bearer(req: Request): AuthPayload | null {
  const h = req.header("authorization")
  if (!h?.startsWith("Bearer ")) return null
  return verifyToken(h.slice(7))
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload | null
    }
  }
}

/** Attaches req.auth if a valid token is present; never rejects. */
export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  req.auth = bearer(req)
  next()
}

/** Requires a logged-in customer (token with a real actor_id). */
export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const auth = bearer(req)
  if (!auth || auth.actor_type !== "customer" || !auth.actor_id) {
    return res.status(401).json({ type: "unauthorized", message: "Unauthorized" })
  }
  req.auth = auth
  next()
}

/** Requires any customer token, including a registration token (actor_id may be ""). */
export function requireCustomerToken(req: Request, res: Response, next: NextFunction) {
  const auth = bearer(req)
  if (!auth || auth.actor_type !== "customer") {
    return res.status(401).json({ type: "unauthorized", message: "Unauthorized" })
  }
  req.auth = auth
  next()
}

/** Requires an admin user token. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = bearer(req)
  if (!auth || auth.actor_type !== "user" || !auth.actor_id) {
    return res.status(401).json({ type: "unauthorized", message: "Unauthorized" })
  }
  req.auth = auth
  next()
}
