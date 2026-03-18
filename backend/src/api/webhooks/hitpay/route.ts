import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import HitpayPaymentProviderService from "../../../modules/hitpay/service"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const container = req.scope

    const paymentModuleService = container.resolve(Modules.PAYMENT)

    const hitpayService = new HitpayPaymentProviderService(container, {
      apiKey: process.env.HITPAY_API_KEY!,
    })

    const payload = {
      data: req.body as Record<string, unknown>,
      rawData: JSON.stringify(req.body),
      headers: req.headers as Record<string, unknown>,
    }

    // Get normalized webhook result
    const result = await hitpayService.getWebhookActionAndData(payload)

    console.log("✅ HitPay webhook received:", JSON.stringify(result, null, 2))

    /**
     * Map HitPay → Medusa payment session status
     */
    let status: "authorized" | "captured" | "canceled" = "canceled"

    switch (result.action) {
      case "authorized":
        status = "authorized"
        break
      case "captured":
        status = "captured"
        break
      case "failed":
      default:
        status = "canceled"
        break
    }

    /**
     * SAFE: Ensure session_id exists
     */
    if (!result.data.session_id) {
      console.warn("⚠️ HitPay webhook missing session_id. Skipping update.")
      res.status(200).json({ received: true })
      return
    }

    console.log(`🔄 Updating Medusa payment_session: ${result.data.session_id}`)

    const paymentSession = await paymentModuleService.retrievePaymentSession(result.data.session_id)

    await paymentModuleService.updatePaymentSession({
      id: result.data.session_id,
      data: result.data,
      status: status as any,
      currency_code: paymentSession.currency_code,
      amount: result.data.amount as any,
    })

    res.status(200).json({ received: true })

  } catch (err: any) {
    console.error("🔥 HitPay webhook error:", err)
    res.status(500).json({ error: err.message })
  }
}
