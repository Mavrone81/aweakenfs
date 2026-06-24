import { db, genId, now, initSchema, hashPassword } from "./db.js"
import { config, PROVIDER_RINGGITPAY } from "./config.js"

initSchema()

const ts = now()

function clear() {
  const tables = [
    "variant_option_value", "product_option_value", "product_option",
    "product_image", "price", "product_variant", "product_category_product",
    "product", "category", "collection", "shipping_option",
    "region_payment_provider", "region_country", "region", "payment_provider",
    "customer_address", "auth_identity", "customer",
    "payment_session", "payment_collection", "shipping_method", "line_item",
    "order_payment", '"order"', "cart", "counter",
  ]
  db.exec("PRAGMA foreign_keys = OFF")
  for (const t of tables) db.exec(`DELETE FROM ${t}`)
  db.exec("PRAGMA foreign_keys = ON")
}

// ---- payment providers ----
function seedPaymentProviders() {
  const ins = db.prepare("INSERT INTO payment_provider (id, is_enabled) VALUES (?, 1)")
  ins.run(PROVIDER_RINGGITPAY)
}

// ---- regions ----
type RegionSeed = {
  name: string
  currency: string
  countries: [string, string, string][] // iso2, iso3, display
  providers: string[]
}

function seedRegions(): Record<string, string> {
  const regions: RegionSeed[] = [
    {
      name: "North America", currency: "usd",
      countries: [["us", "usa", "United States"], ["ca", "can", "Canada"]],
      // RinggitPay only supports MYR/SGD; this demo region has no online provider.
      providers: [],
    },
    {
      name: "Europe", currency: "eur",
      countries: [["gb", "gbr", "United Kingdom"], ["de", "deu", "Germany"], ["fr", "fra", "France"], ["es", "esp", "Spain"], ["it", "ita", "Italy"]],
      // RinggitPay only supports MYR/SGD; this demo region has no online provider.
      providers: [],
    },
    {
      name: "Malaysia", currency: "myr",
      countries: [["my", "mys", "Malaysia"]],
      providers: [PROVIDER_RINGGITPAY],
    },
    {
      name: "Singapore", currency: "sgd",
      countries: [["sg", "sgp", "Singapore"]],
      providers: [PROVIDER_RINGGITPAY],
    },
  ]

  const insRegion = db.prepare(
    "INSERT INTO region (id, name, currency_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
  const insCountry = db.prepare(
    "INSERT INTO region_country (iso_2, region_id, iso_3, name, display_name) VALUES (?, ?, ?, ?, ?)"
  )
  const insProv = db.prepare(
    "INSERT INTO region_payment_provider (region_id, provider_id) VALUES (?, ?)"
  )

  const byCurrency: Record<string, string> = {}
  for (const r of regions) {
    const id = genId("reg")
    insRegion.run(id, r.name, r.currency, ts, ts)
    for (const [iso2, iso3, display] of r.countries) {
      insCountry.run(iso2, id, iso3, display.toUpperCase(), display)
    }
    for (const p of r.providers) insProv.run(id, p)
    byCurrency[r.currency] = id
  }
  return byCurrency
}

// ---- collections & categories ----
function seedCollections(): Record<string, string> {
  const ins = db.prepare(
    "INSERT INTO collection (id, title, handle, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
  const map: Record<string, string> = {}
  for (const [title, handle] of [["Featured", "featured"], ["Latest Drops", "latest-drops"]]) {
    const id = genId("pcol")
    ins.run(id, title, handle, ts, ts)
    map[handle] = id
  }
  return map
}

function seedCategories(): Record<string, string> {
  const ins = db.prepare(
    "INSERT INTO category (id, name, handle, parent_category_id, rank, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
  )
  const map: Record<string, string> = {}
  const cats: [string, string, string | null][] = [
    ["Apparel", "apparel", null],
    ["Shirts", "shirts", "apparel"],
    ["Pants", "pants", "apparel"],
    ["Accessories", "accessories", null],
  ]
  let rank = 0
  for (const [name, handle, parentHandle] of cats) {
    const id = genId("pcat")
    ins.run(id, name, handle, parentHandle ? map[parentHandle] : null, rank++, ts, ts)
    map[handle] = id
  }
  return map
}

// price per currency relative to a usd base
const RATES: Record<string, number> = { usd: 1, eur: 0.92, myr: 4.6, sgd: 1.35 }
function priceRow(variantId: string, baseUsd: number) {
  const ins = db.prepare("INSERT INTO price (id, variant_id, currency_code, amount) VALUES (?, ?, ?, ?)")
  for (const [cur, rate] of Object.entries(RATES)) {
    const amt = Math.round(baseUsd * rate * 100) / 100
    ins.run(genId("price"), variantId, cur, amt)
  }
}

type ProductSeed = {
  title: string
  handle: string
  description: string
  collection?: string
  categories: string[]
  images: [string, string] // front, back (S3 demo bucket, whitelisted by storefront next.config.js)
  sizes: string[]
  priceUsd: number
}

// Medusa public demo image bucket — already allowed by the storefront's next/image config.
const IMG = "https://medusa-public-images.s3.eu-west-1.amazonaws.com"

function seedProducts(collections: Record<string, string>, categories: Record<string, string>) {
  const products: ProductSeed[] = [
    { title: "Classic Tee", handle: "classic-tee", description: "A timeless 100% cotton t-shirt with a relaxed fit.", collection: "featured", categories: ["shirts"], images: [`${IMG}/tee-black-front.png`, `${IMG}/tee-black-back.png`], sizes: ["S", "M", "L", "XL"], priceUsd: 25 },
    { title: "Oxford Shirt", handle: "oxford-shirt", description: "Crisp button-down oxford shirt for any occasion.", collection: "featured", categories: ["shirts"], images: [`${IMG}/longsleeve-vintage-front.png`, `${IMG}/longsleeve-vintage-back.png`], sizes: ["S", "M", "L", "XL"], priceUsd: 55 },
    { title: "Slim Chinos", handle: "slim-chinos", description: "Comfortable stretch chinos with a modern slim cut.", collection: "latest-drops", categories: ["pants"], images: [`${IMG}/sweatpants-gray-front.png`, `${IMG}/sweatpants-gray-back.png`], sizes: ["30", "32", "34", "36"], priceUsd: 65 },
    { title: "Denim Jeans", handle: "denim-jeans", description: "Premium selvedge denim built to last.", collection: "latest-drops", categories: ["pants"], images: [`${IMG}/shorts-vintage-front.png`, `${IMG}/shorts-vintage-back.png`], sizes: ["30", "32", "34", "36"], priceUsd: 89 },
    { title: "Leather Belt", handle: "leather-belt", description: "Full-grain leather belt with a brushed buckle.", categories: ["accessories"], images: [`${IMG}/tee-white-front.png`, `${IMG}/tee-white-back.png`], sizes: ["One Size"], priceUsd: 40 },
    { title: "Canvas Cap", handle: "canvas-cap", description: "Adjustable six-panel canvas cap.", collection: "featured", categories: ["accessories"], images: [`${IMG}/sweatshirt-vintage-front.png`, `${IMG}/sweatshirt-vintage-back.png`], sizes: ["One Size"], priceUsd: 28 },
  ]

  const insProduct = db.prepare(
    "INSERT INTO product (id, title, description, handle, status, thumbnail, collection_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?)"
  )
  const insImage = db.prepare("INSERT INTO product_image (id, product_id, url, rank) VALUES (?, ?, ?, ?)")
  const insOption = db.prepare("INSERT INTO product_option (id, product_id, title, rank) VALUES (?, ?, ?, 0)")
  const insOptionValue = db.prepare("INSERT INTO product_option_value (id, option_id, value) VALUES (?, ?, ?)")
  const insVariant = db.prepare(
    "INSERT INTO product_variant (id, product_id, title, sku, manage_inventory, allow_backorder, inventory_quantity, rank, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?, ?)"
  )
  const insVov = db.prepare("INSERT INTO variant_option_value (variant_id, option_value_id) VALUES (?, ?)")
  const insCatProd = db.prepare("INSERT INTO product_category_product (category_id, product_id) VALUES (?, ?)")

  for (const p of products) {
    const pid = genId("prod")
    const thumb = p.images[0]
    insProduct.run(pid, p.title, p.description, p.handle, thumb, p.collection ? collections[p.collection] : null, ts, ts)
    insImage.run(genId("img"), pid, p.images[0], 0)
    insImage.run(genId("img"), pid, p.images[1], 1)

    const optId = genId("opt")
    insOption.run(optId, pid, "Size")
    let rank = 0
    for (const size of p.sizes) {
      const valId = genId("optval")
      insOptionValue.run(valId, optId, size)
      const vid = genId("variant")
      insVariant.run(vid, pid, size, `${p.handle}-${size}`.toUpperCase(), 50, rank++, ts, ts)
      insVov.run(vid, valId)
      priceRow(vid, p.priceUsd)
    }
    for (const cat of p.categories) insCatProd.run(categories[cat], pid)
  }
}

function seedShipping(regionByCurrency: Record<string, string>) {
  const ins = db.prepare(
    "INSERT INTO shipping_option (id, name, region_id, amount, price_type, provider_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'flat', 'manual', ?, ?)"
  )
  // base amounts in USD, scaled per region currency
  for (const [cur, regionId] of Object.entries(regionByCurrency)) {
    const rate = RATES[cur] ?? 1
    ins.run(genId("so"), "Standard Shipping", regionId, Math.round(8 * rate * 100) / 100, ts, ts)
    ins.run(genId("so"), "Express Shipping", regionId, Math.round(20 * rate * 100) / 100, ts, ts)
  }
}

function seedAdmin() {
  const id = genId("user")
  db.prepare(
    "INSERT INTO auth_identity (id, email, password_hash, actor_type, actor_id, created_at) VALUES (?, ?, ?, 'user', ?, ?)"
  ).run(genId("authid"), config.adminEmail, hashPassword(config.adminPassword), id, ts)
}

const run = db.transaction(() => {
  clear()
  seedPaymentProviders()
  const regionByCurrency = seedRegions()
  const collections = seedCollections()
  const categories = seedCategories()
  seedProducts(collections, categories)
  seedShipping(regionByCurrency)
  seedAdmin()
})

run()

const counts = {
  regions: (db.prepare("SELECT COUNT(*) n FROM region").get() as any).n,
  products: (db.prepare("SELECT COUNT(*) n FROM product").get() as any).n,
  variants: (db.prepare("SELECT COUNT(*) n FROM product_variant").get() as any).n,
  categories: (db.prepare("SELECT COUNT(*) n FROM category").get() as any).n,
}
console.log("✅ Seed complete:", counts)
console.log(`   Admin login: ${config.adminEmail} / ${config.adminPassword}`)
console.log(`   Publishable key: ${config.publishableKey}`)
