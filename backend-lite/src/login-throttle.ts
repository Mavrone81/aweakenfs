/**
 * Login throttle: 5 FAILED attempts per (email, IP) per 15 minutes.
 *
 * Keyed on the pair, deliberately. Per-IP alone misses credential stuffing that
 * rotates addresses while walking a list of accounts, and on a storefront it
 * would lock out every shopper behind one corporate or mobile-carrier NAT.
 * Per-email alone hands anyone a denial-of-service against a known customer --
 * fail five times and the real account holder is locked out, no password
 * required. The pair confines a lockout to the attacker's own address and their
 * chosen account.
 *
 * Counts failures only and clears on success, so a shopper who mistypes once and
 * then gets it right is never penalised. The window expires as a unit, so a
 * lapsed entry starts again at one -- a counter that only ever increments would
 * turn the 15-minute lock into a permanent one, because the next single failure
 * after expiry would re-trip it immediately.
 *
 * The counters are scoped per actor type ("customer" / "user"), so a storefront
 * shopper and a back-office user with the same email address are tracked apart.
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5

type Entry = { n: number; resetAt: number }

export function createLoginThrottle({ windowMs = WINDOW_MS, max = MAX_FAILS } = {}) {
  const fails = new Map<string, Entry>()

  const key = (actor: string, email: string, ip: string) =>
    `${actor}:${String(email ?? "").trim().toLowerCase().slice(0, 190)}|${ip || "unknown"}`

  return {
    key,
    blocked(k: string, now: number = Date.now()): boolean {
      const e = fails.get(k)
      return !!e && now <= e.resetAt && e.n >= max
    },
    fail(k: string, now: number = Date.now()): void {
      const e = fails.get(k)
      if (!e || now > e.resetAt) fails.set(k, { n: 1, resetAt: now + windowMs })
      else e.n += 1
    },
    clear(k: string): void {
      fails.delete(k)
    },
    /** Drop expired entries so the map cannot grow without bound. */
    sweep(now: number = Date.now()): void {
      for (const [k, e] of fails) if (now > e.resetAt) fails.delete(k)
    },
    get size(): number {
      return fails.size
    },
  }
}

export const LOGIN_WINDOW_MS = WINDOW_MS
export const LOGIN_MAX_FAILS = MAX_FAILS
