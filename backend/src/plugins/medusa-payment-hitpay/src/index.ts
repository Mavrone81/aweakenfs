import { HitPayProcessor, HITPAY_IDENTIFIER } from "./hitpay-processor"

export default (container, options) => {
  const hitpay = new HitPayProcessor(container, options)
  return {
    resolve: {
      payment_provider_service: {
        inject: ["paymentProviderService"],
        useFactory: () => {
          return hitpay
        },
      },
    },
    options: {
      [HITPAY_IDENTIFIER]: {
        apiKey: process.env.HITPAY_API_KEY,
        hmacSalt: process.env.HITPAY_HMAC_SALT,
        redirectUrl: process.env.HITPAY_REDIRECT_URL,
        webhookUrl: process.env.HITPAY_WEBHOOK_URL,
        paymentMethods: ["card", "paynow_online"],
      },
    },
  }
}
