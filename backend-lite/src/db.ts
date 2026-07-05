import Database from "better-sqlite3"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import crypto from "node:crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dirname, "..", "data.db")

export const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

/**
 * Medusa-style id: `<prefix>_<26 char base32-ish>`. Not a real ULID but
 * shaped the same and good enough for a single-node light backend. The prefix
 * matters because the storefront/webhook branch on it (e.g. `cart_`, `paysess_`).
 */
export function genId(prefix: string): string {
  const raw = crypto.randomBytes(16).toString("hex").slice(0, 26).toUpperCase()
  return `${prefix}_${raw}`
}

export function now(): string {
  return new Date().toISOString()
}

/** Parse a JSON text column, tolerating null/empty. */
export function parseJSON<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback
  try {
    return JSON.parse(value as string) as T
  } catch {
    return fallback
  }
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS region (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS region_country (
  iso_2 TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES region(id) ON DELETE CASCADE,
  iso_3 TEXT,
  num_code TEXT,
  name TEXT,
  display_name TEXT
);

-- Which payment providers are enabled for a region (the "payment mode" admin toggles).
CREATE TABLE IF NOT EXISTS region_payment_provider (
  region_id TEXT NOT NULL REFERENCES region(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  PRIMARY KEY (region_id, provider_id)
);

CREATE TABLE IF NOT EXISTS payment_provider (
  id TEXT PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS collection (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  handle TEXT UNIQUE NOT NULL,
  parent_category_id TEXT REFERENCES category(id) ON DELETE SET NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_internal INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  handle TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  thumbnail TEXT,
  weight INTEGER,
  collection_id TEXT REFERENCES collection(id) ON DELETE SET NULL,
  type_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_image (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_option (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_option_value (
  id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL REFERENCES product_option(id) ON DELETE CASCADE,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variant (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sku TEXT,
  manage_inventory INTEGER NOT NULL DEFAULT 1,
  allow_backorder INTEGER NOT NULL DEFAULT 0,
  inventory_quantity INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Maps a variant to the option values that define it (e.g. Size=M, Color=Red).
CREATE TABLE IF NOT EXISTS variant_option_value (
  variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
  option_value_id TEXT NOT NULL REFERENCES product_option_value(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, option_value_id)
);

-- Price per variant per currency (major units, e.g. 19.99).
CREATE TABLE IF NOT EXISTS price (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS product_category_product (
  category_id TEXT NOT NULL REFERENCES category(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, product_id)
);

CREATE TABLE IF NOT EXISTS shipping_option (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region_id TEXT REFERENCES region(id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0,
  price_type TEXT NOT NULL DEFAULT 'flat',
  provider_id TEXT NOT NULL DEFAULT 'manual',
  data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  company_name TEXT,
  has_account INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Auth identity (emailpass). actor_id links to customer.id (or admin user id).
CREATE TABLE IF NOT EXISTS auth_identity (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'customer',
  actor_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (email, actor_type)
);

CREATE TABLE IF NOT EXISTS customer_address (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  address_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  address_1 TEXT,
  address_2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country_code TEXT,
  phone TEXT,
  is_default_shipping INTEGER NOT NULL DEFAULT 0,
  is_default_billing INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart (
  id TEXT PRIMARY KEY,
  region_id TEXT REFERENCES region(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customer(id) ON DELETE SET NULL,
  email TEXT,
  currency_code TEXT NOT NULL,
  shipping_address TEXT,
  billing_address TEXT,
  promo_codes TEXT,
  completed_at TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS line_item (
  id TEXT PRIMARY KEY,
  cart_id TEXT REFERENCES cart(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id TEXT,
  product_id TEXT,
  product_title TEXT,
  product_handle TEXT,
  variant_title TEXT,
  variant_sku TEXT,
  title TEXT NOT NULL,
  thumbnail TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipping_method (
  id TEXT PRIMARY KEY,
  cart_id TEXT REFERENCES cart(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES "order"(id) ON DELETE CASCADE,
  shipping_option_id TEXT,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_collection (
  id TEXT PRIMARY KEY,
  cart_id TEXT REFERENCES cart(id) ON DELETE CASCADE,
  amount REAL NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_paid',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_session (
  id TEXT PRIMARY KEY,
  payment_collection_id TEXT NOT NULL REFERENCES payment_collection(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "order" (
  id TEXT PRIMARY KEY,
  display_id INTEGER,
  cart_id TEXT,
  region_id TEXT,
  customer_id TEXT,
  email TEXT,
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'not_paid',
  fulfillment_status TEXT NOT NULL DEFAULT 'not_fulfilled',
  shipping_address TEXT,
  billing_address TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_payment (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'captured',
  data TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counter (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Durable audit trail of every RinggitPay interaction (outbound requests +
-- inbound responses). Survives restarts, unlike console logs. The REQUEST/RESPONSE
-- keys are never part of any payload, so nothing secret is stored here.
CREATE TABLE IF NOT EXISTS ringgitpay_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  direction TEXT NOT NULL,        -- 'out' (we called RinggitPay) | 'in' (RinggitPay called us)
  kind TEXT NOT NULL,             -- initiate | enquiry_request | enquiry_response | webhook | return
  order_id TEXT,                  -- RinggitPay orderId (short ref) when known
  cart_id TEXT,
  session_id TEXT,
  status_code TEXT,               -- rp_statusCode when present
  endpoint TEXT,                  -- target URL for outbound calls
  payload TEXT NOT NULL           -- full JSON body
);

CREATE INDEX IF NOT EXISTS idx_variant_product ON product_variant(product_id);
CREATE INDEX IF NOT EXISTS idx_price_variant ON price(variant_id);
CREATE INDEX IF NOT EXISTS idx_image_product ON product_image(product_id);
CREATE INDEX IF NOT EXISTS idx_line_cart ON line_item(cart_id);
CREATE INDEX IF NOT EXISTS idx_line_order ON line_item(order_id);
CREATE INDEX IF NOT EXISTS idx_cat_prod ON product_category_product(product_id);
CREATE INDEX IF NOT EXISTS idx_ship_region ON shipping_option(region_id);
CREATE INDEX IF NOT EXISTS idx_rplog_order ON ringgitpay_log(order_id);
CREATE INDEX IF NOT EXISTS idx_rplog_created ON ringgitpay_log(created_at);
`

export function initSchema(): void {
  db.exec(SCHEMA)
}

/** Atomic incrementing counter (used for order display_id). */
export function nextCounter(name: string): number {
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO counter (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1"
    ).run(name)
    return (db.prepare("SELECT value FROM counter WHERE name = ?").get(name) as { value: number }).value
  })
  return tx()
}

// ---- password hashing (scrypt; avoids native bcrypt) ----
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const test = crypto.scryptSync(password, salt, 64).toString("hex")
  const a = Buffer.from(hash, "hex")
  const b = Buffer.from(test, "hex")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
