import axios from "axios"
import crypto from "crypto"
import {
  AbstractPaymentProcessor,
  PaymentProcessorError,
  CreatePaymentSessionInput,
  // other Medusa types you might need (e.g. PaymentSession, etc.)
} from "medusa-interfaces"

import {
  HitPayOptions,
  HitPaySessionData,
  HitPayWebhookPayload,
  WebhookActionAndData,
} from "./types"  // import your types

export const HITPAY_IDENTIFIER = "hitpay"

export class HitPayProcessor extends AbstractPaymentProcessor {
  static identifier = HITPAY_IDENTIFIER

  protected options: HitPayOptions

  constructor(container, options: HitPayOptions) {
    super(container)
    this.options = options

    // Optionally, validate important options at startup
    if (!options.apiKey) {
      throw new Error("HitPayPlugin: apiKey is required")
    }
    if (!options.hmacSalt) {
      throw new Error("HitPayPlugin: hmacSalt is required")
    }
    if (!options.redirectUrl) {
      throw new Error("HitPayPlugin: redirectUrl is required")
    }
    if (!options.webhookUrl) {
      throw new Error("HitPayPlugin: webhookUrl is required")
    }
    if (!Array.isArray(options.paymentMethods) || options.paymentMethods.length === 0) {
      throw new Error("HitPayPlugin: paymentMethods must be a non-empty array")
    }
  }

  /** Called when user initiates payment (i.e. selects provider) */
  async initiatePayment(
    cart,
    context,
    data: CreatePaymentSessionInput
  ): Promise<{ session_data: HitPaySessionData } | PaymentProcessorError> {
    try {
      const { total, currency } = cart
      // If `total` is in cents (or integer minor units), convert to decimal / string
      // Adjust this logic according to how HitPay expects amount
      const amount = (total / 100).toFixed(2)  // e.g. "10.50"

      const payload: Record<string, any> = {
        amount,
        currency,
        payment_methods: this.options.paymentMethods,
        reference_number: cart.id,
        redirect_url: this.options.redirectUrl,
        webhook: this.options.webhookUrl,
        email: cart.email ?? undefined,
        name: cart.shipping_address
          ? `${cart.shipping_address.first_name} ${cart.shipping_address.last_name}`
          : undefined,
      }

      const resp = await axios.post(
        "https://api.hit-pay.com/v1/payment-requests",
        payload,
        {
          headers: {
            "X-BUSINESS-API-KEY": this.options.apiKey,
            "Content-Type": "application/json",
          },
        }
      )

      const respData = resp.data
      const request_id = respData.id
      const checkout_url = respData.url

      if (!request_id || !checkout_url) {
        return {
          error: "Invalid response from HitPay: missing id or url",
          detail: respData,
        }
      }

      return {
        session_data: {
          request_id,
          checkout_url,
        },
      }
    } catch (err: any) {
      return {
        error: "Failed to initiate HitPay payment",
        detail: err?.response?.data ?? err.message ?? err,
      }
    }
  }

  /** After initiation, Medusa may call this to verify / authorize / get status */
  async authorizePayment(
    sessionData: HitPaySessionData,
    context
  ): Promise<{ status: string; data: any } | PaymentProcessorError> {
    try {
      const statusData = await this.getPaymentRequestStatus(sessionData.request_id)

      const status = statusData.status
      // Map statuses: you may adjust mapping per HitPay spec
      if (status === "completed") {
        return { status: "authorized", data: statusData }
      }
      if (status === "pending") {
        return { status: "pending", data: statusData }
      }
      // e.g. "failed", "cancelled", etc.
      return { status: "failed", data: statusData }
    } catch (e: any) {
      return {
        error: "Failed to authorize HitPay payment",
        detail: e?.response?.data ?? e.message ?? e,
      }
    }
  }

  /** Capture, if needed */
  async capturePayment(
    sessionData: HitPaySessionData,
    context
  ): Promise<{ status: string; data: any } | PaymentProcessorError> {
    // If HitPay supports separate capture, call that API here.
    // If payment is already captured when completed, just return success.
    return { status: "captured", data: {} }
  }

  /** Refund logic */
  async refundPayment(
    sessionData: HitPaySessionData,
    amount: number,
    context
  ): Promise<{ status: string; data: any } | PaymentProcessorError> {
    try {
      // Convert amount appropriately (e.g. minor units to decimal)
      const refundAmount = (amount / 100).toFixed(2)

      const resp = await axios.post(
        `https://api.hit-pay.com/v1/payment-requests/${sessionData.request_id}/refund`,
        {
          amount: refundAmount,
        },
        {
          headers: {
            "X-BUSINESS-API-KEY": this.options.apiKey,
          },
        }
      )
      return { status: "refunded", data: resp.data }
    } catch (e: any) {
      return {
        error: "Failed to refund via HitPay",
        detail: e?.response?.data ?? e.message ?? e,
      }
    }
  }

  /** Optionally retrieve status from HitPay */
  async getPaymentRequestStatus(request_id: string): Promise<any> {
    const resp = await axios.get(
      `https://api.hit-pay.com/v1/payment-requests/${request_id}`,
      {
        headers: {
          "X-BUSINESS-API-KEY": this.options.apiKey,
        },
      }
    )
    return resp.data
  }

  /** Webhook handling: interpret incoming webhook, verify, map to action */
  async getWebhookActionAndData(
    req
  ): Promise<WebhookActionAndData | PaymentProcessorError> {
    const payload = req.body as HitPayWebhookPayload
    const signature = payload.hmac
    if (!signature) {
      return {
        error: "Missing webhook signature (hmac)",
      }
    }

    const copy = { ...payload }
    delete copy.hmac

    const sortedKeys = Object.keys(copy).sort()
    let str = ""
    for (const key of sortedKeys) {
      const val = copy[key] == null ? "" : copy[key].toString()
      str += `${key}${val}`
    }

    const computed = crypto
      .createHmac("sha256", this.options.hmacSalt)
      .update(str)
      .digest("hex")

    if (computed !== signature) {
      return {
        error: "Invalid webhook signature",
      }
    }

    const status = payload.status
    let action = "pending"
    if (status === "completed") {
      action = "captured"
    } else if (status === "failed") {
      action = "failed"
    }

    return {
      action,
      data: {
        request_id: payload.payment_request_id,
        payment_id: payload.payment_id,
        reference_number: payload.reference_number,
      },
    }
  }
}
