import { db, parseJSON } from "./db.js"

/**
 * These builders translate SQLite rows into the exact JSON shapes the Medusa v2
 * Store API returns — the storefront reads them via @medusajs/js-sdk and renders
 * directly, so field names/nesting must match. Amounts are MAJOR units (e.g. 19.99).
 */

type Row = Record<string, any>

const q = (sql: string) => db.prepare(sql)

// ---------------- prices ----------------

export function variantPrice(variantId: string, currency: string) {
  const cur = currency.toLowerCase()
  const row = q("SELECT amount FROM price WHERE variant_id = ? AND currency_code = ?").get(
    variantId,
    cur
  ) as Row | undefined
  const amount = row ? Number(row.amount) : 0
  const priceMeta = {
    id: `price_${variantId}_${cur}`,
    price_list_id: null,
    price_list_type: "default",
    min_quantity: null,
    max_quantity: null,
  }
  return {
    id: `calc_${variantId}_${cur}`,
    is_calculated_price_price_list: false,
    is_calculated_price_tax_inclusive: false,
    calculated_amount: amount,
    raw_calculated_amount: { value: String(amount), precision: 20 },
    is_original_price_price_list: false,
    is_original_price_tax_inclusive: false,
    original_amount: amount,
    raw_original_amount: { value: String(amount), precision: 20 },
    currency_code: cur,
    calculated_price: priceMeta,
    original_price: priceMeta,
  }
}

// ---------------- product ----------------

export function variantOptions(variantId: string) {
  const rows = q(
    `SELECT pov.id AS value_id, pov.value AS value, po.id AS option_id, po.title AS option_title
       FROM variant_option_value vov
       JOIN product_option_value pov ON pov.id = vov.option_value_id
       JOIN product_option po ON po.id = pov.option_id
      WHERE vov.variant_id = ?`
  ).all(variantId) as Row[]
  return rows.map((r) => ({
    id: r.value_id,
    value: r.value,
    option_id: r.option_id,
    option: { id: r.option_id, title: r.option_title },
  }))
}

export function serializeVariant(v: Row, currency: string) {
  return {
    id: v.id,
    title: v.title,
    sku: v.sku,
    product_id: v.product_id,
    manage_inventory: !!v.manage_inventory,
    allow_backorder: !!v.allow_backorder,
    inventory_quantity: v.inventory_quantity,
    calculated_price: variantPrice(v.id, currency),
    options: variantOptions(v.id),
    created_at: v.created_at,
    updated_at: v.updated_at,
    metadata: parseJSON(v.metadata, null),
  }
}

export function serializeProduct(p: Row, currency: string) {
  const variants = q(
    "SELECT * FROM product_variant WHERE product_id = ? ORDER BY rank, created_at"
  ).all(p.id) as Row[]
  const images = q(
    "SELECT id, url FROM product_image WHERE product_id = ? ORDER BY rank"
  ).all(p.id) as Row[]
  const options = q(
    "SELECT id, title FROM product_option WHERE product_id = ? ORDER BY rank"
  ).all(p.id) as Row[]
  const optionsWithValues = options.map((o) => ({
    id: o.id,
    title: o.title,
    values: (
      q("SELECT id, value FROM product_option_value WHERE option_id = ?").all(o.id) as Row[]
    ).map((val) => ({ id: val.id, value: val.value })),
  }))
  const collection = p.collection_id
    ? (q("SELECT id, title, handle FROM collection WHERE id = ?").get(p.collection_id) as Row | undefined)
    : null
  const categories = q(
    `SELECT c.id, c.name, c.handle FROM category c
       JOIN product_category_product pcp ON pcp.category_id = c.id
      WHERE pcp.product_id = ?`
  ).all(p.id) as Row[]

  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    handle: p.handle,
    status: p.status,
    thumbnail: p.thumbnail,
    weight: p.weight,
    length: null,
    height: null,
    width: null,
    material: null,
    origin_country: null,
    collection_id: p.collection_id,
    collection: collection || null,
    type_id: p.type_id,
    type: null,
    images,
    options: optionsWithValues,
    variants: variants.map((v) => serializeVariant(v, currency)),
    categories,
    tags: [],
    created_at: p.created_at,
    updated_at: p.updated_at,
    metadata: parseJSON(p.metadata, null),
  }
}

// ---------------- collection / category ----------------

export function serializeCollection(c: Row) {
  return {
    id: c.id,
    title: c.title,
    handle: c.handle,
    created_at: c.created_at,
    updated_at: c.updated_at,
    metadata: parseJSON(c.metadata, null),
  }
}

export function serializeCategory(c: Row, withChildren = true): any {
  const base: Row = {
    id: c.id,
    name: c.name,
    description: c.description || "",
    handle: c.handle,
    rank: c.rank,
    parent_category_id: c.parent_category_id,
    is_active: !!c.is_active,
    is_internal: !!c.is_internal,
    created_at: c.created_at,
    updated_at: c.updated_at,
    metadata: parseJSON(c.metadata, null),
  }
  if (withChildren) {
    const children = q(
      "SELECT * FROM category WHERE parent_category_id = ? ORDER BY rank"
    ).all(c.id) as Row[]
    base.category_children = children.map((ch) => serializeCategory(ch, false))
    base.parent_category = c.parent_category_id
      ? serializeCategory(
          q("SELECT * FROM category WHERE id = ?").get(c.parent_category_id) as Row,
          false
        )
      : null
  }
  return base
}

// ---------------- region ----------------

export function serializeRegion(r: Row) {
  const countries = q(
    "SELECT iso_2, iso_3, num_code, name, display_name FROM region_country WHERE region_id = ?"
  ).all(r.id) as Row[]
  const providers = q(
    "SELECT provider_id FROM region_payment_provider WHERE region_id = ?"
  ).all(r.id) as Row[]
  return {
    id: r.id,
    name: r.name,
    currency_code: r.currency_code,
    automatic_taxes: false,
    countries: countries.map((c) => ({
      iso_2: c.iso_2,
      iso_3: c.iso_3,
      num_code: c.num_code,
      name: c.name,
      display_name: c.display_name,
      region_id: r.id,
    })),
    payment_providers: providers.map((p) => ({ id: p.provider_id, is_enabled: true })),
    created_at: r.created_at,
    updated_at: r.updated_at,
    metadata: parseJSON(r.metadata, null),
  }
}

export function regionCurrency(regionId: string): string {
  const r = q("SELECT currency_code FROM region WHERE id = ?").get(regionId) as Row | undefined
  return (r?.currency_code || "usd").toLowerCase()
}

// ---------------- shipping option ----------------

export function serializeShippingOption(o: Row) {
  return {
    id: o.id,
    name: o.name,
    amount: Number(o.amount),
    price_type: o.price_type,
    provider_id: o.provider_id,
    service_zone: null,
    type: { id: `sotype_${o.id}`, label: o.name, code: "standard", description: o.name },
    data: parseJSON(o.data, {}),
    insufficient_inventory: false,
  }
}

// ---------------- customer / address ----------------

export function serializeAddress(a: Row) {
  return {
    id: a.id,
    customer_id: a.customer_id,
    address_name: a.address_name,
    first_name: a.first_name,
    last_name: a.last_name,
    company: a.company,
    address_1: a.address_1,
    address_2: a.address_2,
    city: a.city,
    province: a.province,
    postal_code: a.postal_code,
    country_code: a.country_code,
    phone: a.phone,
    is_default_shipping: !!a.is_default_shipping,
    is_default_billing: !!a.is_default_billing,
    metadata: parseJSON(a.metadata, null),
    created_at: a.created_at,
    updated_at: a.updated_at,
  }
}

export function serializeCustomer(c: Row) {
  const addresses = q(
    "SELECT * FROM customer_address WHERE customer_id = ? ORDER BY created_at"
  ).all(c.id) as Row[]
  return {
    id: c.id,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    company_name: c.company_name,
    has_account: !!c.has_account,
    addresses: addresses.map(serializeAddress),
    default_billing_address_id:
      addresses.find((a) => a.is_default_billing)?.id ?? null,
    default_shipping_address_id:
      addresses.find((a) => a.is_default_shipping)?.id ?? null,
    created_at: c.created_at,
    updated_at: c.updated_at,
    metadata: parseJSON(c.metadata, null),
  }
}

// ---------------- line items + totals ----------------

function serializeLineItem(li: Row, currency: string) {
  // Build an enriched variant so the storefront's getPricesForVariant() works.
  const variantRow = li.variant_id
    ? (q("SELECT * FROM product_variant WHERE id = ?").get(li.variant_id) as Row | undefined)
    : undefined
  const productRow = li.product_id
    ? (q("SELECT id, title, handle, thumbnail FROM product WHERE id = ?").get(li.product_id) as Row | undefined)
    : undefined

  const unit = Number(li.unit_price)
  const calc = variantRow
    ? variantPrice(variantRow.id, currency)
    : {
        calculated_amount: unit,
        original_amount: unit,
        currency_code: currency.toLowerCase(),
        calculated_price: { price_list_type: "default" },
      }
  // Keep the displayed price consistent with the snapshot unit_price.
  calc.calculated_amount = unit
  calc.original_amount = unit

  const total = unit * li.quantity

  const variant = variantRow
    ? {
        id: variantRow.id,
        title: variantRow.title,
        sku: variantRow.sku,
        product_id: variantRow.product_id,
        calculated_price: calc,
        options: variantOptions(variantRow.id),
        product: productRow
          ? { id: productRow.id, title: productRow.title, handle: productRow.handle, thumbnail: productRow.thumbnail }
          : null,
      }
    : { calculated_price: calc, options: [], product: productRow ?? null }

  return {
    id: li.id,
    cart_id: li.cart_id,
    order_id: li.order_id,
    title: li.title,
    subtitle: li.product_title,
    thumbnail: li.thumbnail,
    quantity: li.quantity,
    unit_price: unit,
    product_id: li.product_id,
    product_title: li.product_title,
    product_handle: li.product_handle,
    variant_id: li.variant_id,
    variant_title: li.variant_title,
    variant_sku: li.variant_sku,
    variant,
    subtotal: total,
    total,
    original_total: total,
    discount_total: 0,
    tax_total: 0,
    adjustments: [],
    metadata: parseJSON(li.metadata, null),
    created_at: li.created_at,
  }
}

function cartShippingMethods(cartId: string) {
  return (
    q("SELECT * FROM shipping_method WHERE cart_id = ? ORDER BY created_at").all(cartId) as Row[]
  ).map((m) => ({
    id: m.id,
    shipping_option_id: m.shipping_option_id,
    name: m.name,
    amount: Number(m.amount),
    total: Number(m.amount),
    subtotal: Number(m.amount),
    tax_total: 0,
    created_at: m.created_at,
  }))
}

function paymentCollectionForCart(cartId: string) {
  const pc = q("SELECT * FROM payment_collection WHERE cart_id = ?").get(cartId) as Row | undefined
  if (!pc) return null
  const sessions = q(
    "SELECT * FROM payment_session WHERE payment_collection_id = ? ORDER BY created_at"
  ).all(pc.id) as Row[]
  return {
    id: pc.id,
    amount: Number(pc.amount),
    currency_code: pc.currency_code,
    status: pc.status,
    payment_sessions: sessions.map((s) => ({
      id: s.id,
      provider_id: s.provider_id,
      status: s.status,
      amount: Number(s.amount),
      currency_code: s.currency_code,
      data: parseJSON(s.data, {}),
      payment_collection_id: pc.id,
      created_at: s.created_at,
    })),
  }
}

export function computeItemsSubtotal(items: { unit_price: number; quantity: number }[]) {
  return items.reduce((acc, i) => acc + Number(i.unit_price) * i.quantity, 0)
}

export function serializeCart(cartId: string): any {
  const c = q("SELECT * FROM cart WHERE id = ?").get(cartId) as Row | undefined
  if (!c) return null
  const currency = c.currency_code
  const itemRows = q(
    "SELECT * FROM line_item WHERE cart_id = ? ORDER BY created_at"
  ).all(cartId) as Row[]
  const items = itemRows.map((li) => serializeLineItem(li, currency))
  const shippingMethods = cartShippingMethods(cartId)

  const subtotal = computeItemsSubtotal(itemRows.map((i) => ({ unit_price: i.unit_price, quantity: i.quantity })))
  const shipping_total = shippingMethods.reduce((a, m) => a + m.amount, 0)
  const discount_total = 0
  const tax_total = 0
  const gift_card_total = 0
  const total = subtotal + shipping_total + tax_total - discount_total - gift_card_total

  const region = c.region_id ? serializeRegion(q("SELECT * FROM region WHERE id = ?").get(c.region_id) as Row) : null

  return {
    id: c.id,
    region_id: c.region_id,
    region,
    customer_id: c.customer_id,
    email: c.email,
    currency_code: currency,
    shipping_address: parseJSON(c.shipping_address, null),
    billing_address: parseJSON(c.billing_address, null),
    items,
    shipping_methods: shippingMethods,
    payment_collection: paymentCollectionForCart(cartId),
    promotions: [],
    gift_cards: [],
    discount_total,
    gift_card_total,
    subtotal,
    item_total: subtotal,
    item_subtotal: subtotal,
    shipping_total,
    shipping_subtotal: shipping_total,
    tax_total,
    total,
    original_total: total,
    completed_at: c.completed_at,
    created_at: c.created_at,
    updated_at: c.updated_at,
    metadata: parseJSON(c.metadata, null),
  }
}

export function serializeOrder(orderId: string): any {
  const o = q('SELECT * FROM "order" WHERE id = ?').get(orderId) as Row | undefined
  if (!o) return null
  const currency = o.currency_code
  const itemRows = q(
    "SELECT * FROM line_item WHERE order_id = ? ORDER BY created_at"
  ).all(orderId) as Row[]
  const items = itemRows.map((li) => serializeLineItem(li, currency))
  const shipMethods = (
    q("SELECT * FROM shipping_method WHERE order_id = ? ORDER BY created_at").all(orderId) as Row[]
  ).map((m) => ({
    id: m.id,
    name: m.name,
    amount: Number(m.amount),
    total: Number(m.amount),
    subtotal: Number(m.amount),
    tax_total: 0,
  }))
  const payments = q("SELECT * FROM order_payment WHERE order_id = ?").all(orderId) as Row[]

  const subtotal = computeItemsSubtotal(itemRows.map((i) => ({ unit_price: i.unit_price, quantity: i.quantity })))
  const shipping_total = shipMethods.reduce((a, m) => a + m.amount, 0)
  const total = subtotal + shipping_total

  return {
    id: o.id,
    display_id: o.display_id,
    status: o.status,
    payment_status: o.payment_status,
    fulfillment_status: o.fulfillment_status,
    email: o.email,
    currency_code: currency,
    region_id: o.region_id,
    customer_id: o.customer_id,
    items,
    shipping_methods: shipMethods,
    shipping_address: parseJSON(o.shipping_address, null),
    billing_address: parseJSON(o.billing_address, null),
    payment_collections: [
      {
        id: `pay_col_${o.id}`,
        amount: total,
        currency_code: currency,
        status: o.payment_status === "captured" ? "captured" : "authorized",
        payments: payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          currency_code: p.currency_code,
          provider_id: p.provider_id,
          captured_at: p.status === "captured" ? p.created_at : null,
          created_at: p.created_at,
          data: parseJSON(p.data, {}),
        })),
      },
    ],
    fulfillments: [],
    subtotal,
    discount_total: 0,
    gift_card_total: 0,
    shipping_total,
    tax_total: 0,
    total,
    original_total: total,
    created_at: o.created_at,
    updated_at: o.updated_at,
    metadata: parseJSON(o.metadata, null),
  }
}
