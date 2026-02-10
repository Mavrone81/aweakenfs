export const HITPAY_IDENTIFIER = "hitpay"

export interface HitPayOptions {
  apiKey: string
  hmacSalt: string
  redirectUrl: string
  webhookUrl: string
  paymentMethods: string[]
}

export interface HitPaySessionData {
  request_id: string
  checkout_url: string
}

export interface HitPayWebhookPayload {
  payment_request_id: string
  reference_number: string
  payment_id: string
  status: string
  hmac: string
  [key: string]: any
}

export interface WebhookActionAndData {
  action: string
  data: {
    request_id: string
    payment_id: string
    reference_number: string
    [key: string]: any
  }
}
