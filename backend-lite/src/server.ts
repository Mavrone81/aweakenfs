import express from "express"
import cors from "cors"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { config } from "./config.js"
import { initSchema, db } from "./db.js"
import { authRouter } from "./routes/auth.js"
import { storeRouter } from "./routes/store.js"
import { adminRouter } from "./routes/admin.js"
import { webhookRouter } from "./routes/webhooks.js"
import { reconcilePendingRinggitPay } from "./reconcile.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

initSchema()

// Warn (don't crash) if the DB has no regions — the storefront needs them.
const regionCount = (db.prepare("SELECT COUNT(*) n FROM region").get() as any).n
if (regionCount === 0) {
  console.warn("⚠️  No regions found. Run `npm run seed` to populate the database.")
}

const app = express()

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "authorization", "x-publishable-api-key"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
)
app.use(express.json({ limit: "2mb" }))
app.use(express.urlencoded({ extended: true })) // RinggitPay webhook may post form-encoded

app.get("/health", (_req, res) => res.json({ status: "ok" }))

// Storefront publishable-key exchange (matches the original backend route).
app.get("/key-exchange", (_req, res) => {
  res.json({ publishableApiKey: config.publishableKey, publishable_api_key: config.publishableKey })
})

app.use("/auth", authRouter)
app.use("/store", storeRouter)
app.use("/admin", adminRouter)
app.use("/api/webhooks", webhookRouter)

// Minimal admin dashboard (served at /app, like Medusa's).
const adminUiDir = join(__dirname, "admin-ui")
app.use("/app", express.static(adminUiDir))
app.get("/app", (_req, res) => res.sendFile(join(adminUiDir, "index.html")))
app.get("/", (_req, res) => res.redirect("/app"))

// 404 + error handlers
app.use((req, res) => res.status(404).json({ type: "not_found", message: `Route not found: ${req.method} ${req.path}` }))
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("🔥 Unhandled error:", err)
  res.status(500).json({ type: "server_error", message: err?.message || "Internal error" })
})

app.listen(config.port, () => {
  console.log(`\n🟢 Light backend on http://localhost:${config.port}`)
  console.log(`   Store API:  http://localhost:${config.port}/store`)
  console.log(`   Admin UI:   http://localhost:${config.port}/app`)
  console.log(`   Key:        ${config.publishableKey}\n`)
})

// Periodically reconcile pending RinggitPay sessions against the Transaction
// Enquiry API (safety net for outcomes the browser-return never delivered).
// Disable with RINGGITPAY_RECONCILE_DISABLED=true; tune with *_INTERVAL_MS.
if (process.env.RINGGITPAY_RECONCILE_DISABLED !== "true") {
  const intervalMs = Number(process.env.RINGGITPAY_RECONCILE_INTERVAL_MS || 10 * 60 * 1000)
  const run = () => { reconcilePendingRinggitPay().catch((e) => console.error("🔄 reconcile error:", e?.message || e)) }
  setTimeout(run, 30_000).unref()
  setInterval(run, intervalMs).unref()
  console.log(`   Reconcile:  every ${Math.round(intervalMs / 1000)}s (RinggitPay enquiry)\n`)
}
