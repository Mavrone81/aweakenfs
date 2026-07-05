/** Central runtime config, sourced from env with sensible local defaults. */
export const config = {
  port: Number(process.env.PORT || 9000),

  jwtSecret: process.env.JWT_SECRET || "lite-jwt-secret-change-me",

  // The single publishable key the storefront uses. Returned by /key-exchange.
  publishableKey: process.env.PUBLISHABLE_KEY || "pk_lite_storefront_key",

  // Public URLs used to build payment return/webhook URLs.
  storeUrl: (process.env.STORE_URL || "http://localhost:8000").replace(/\/+$/, ""),
  backendUrl: (process.env.BACKEND_PUBLIC_URL || "http://localhost:9000").replace(/\/+$/, ""),

  // CORS origins (comma separated). "*" allows all.
  storeCors: process.env.STORE_CORS || "*",
  adminCors: process.env.ADMIN_CORS || "*",
  authCors: process.env.AUTH_CORS || "*",

  // Admin bootstrap user (created on seed).
  adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD || "supersecret",

  ringgitpay: {
    appId: process.env.RINGGITPAY_APP_ID || "TEST_APP_ID",
    requestKey: process.env.RINGGITPAY_REQUEST_KEY || "TEST_REQUEST_KEY",
    responseKey:
      process.env.RINGGITPAY_RESPONSE_KEY ||
      process.env.RINGGITPAY_REQUEST_KEY ||
      "TEST_REQUEST_KEY",
    isSandbox: process.env.RINGGITPAY_IS_SANDBOX === "true",
  },
}

export const PROVIDER_RINGGITPAY = "pp_ringgitpay_ringgitpay"
export const PROVIDER_MANUAL = "pp_system_default"
