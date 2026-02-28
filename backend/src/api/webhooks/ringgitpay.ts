import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import RinggitPayProviderService from "../../modules/ringgitpay/service"
import {
    RINGGITPAY_APP_ID,
    RINGGITPAY_REQUEST_KEY,
    RINGGITPAY_RESPONSE_KEY,
    RINGGITPAY_IS_SANDBOX
} from "../../lib/constants"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const container = req.scope

        const paymentModuleService = container.resolve(Modules.PAYMENT)

        const ringgitpayService = new RinggitPayProviderService(container, {
            appId: RINGGITPAY_APP_ID!,
            requestKey: RINGGITPAY_REQUEST_KEY!,
            responseKey: RINGGITPAY_RESPONSE_KEY!,
            isSandbox: RINGGITPAY_IS_SANDBOX === 'true',
        })

        const payload = {
            data: req.body as Record<string, unknown>,
            rawData: JSON.stringify(req.body),
            headers: req.headers as Record<string, unknown>,
        }

        // Get normalized webhook result
        const result = await ringgitpayService.getWebhookActionAndData(payload)

        console.log("=========================================")
        console.log("✅ RAW RINGGITPAY WEBHOOK RESPONSE DATA ✅")
        console.log(JSON.stringify(req.body, null, 2))
        console.log("=========================================")

        console.log("✅ Parsed Action:", JSON.stringify(result, null, 2))

        /**
         * Map RinggitPay → Medusa payment session status
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
            console.warn("⚠️ RinggitPay webhook missing session_id. Skipping update.")
            res.status(200).json({ received: true })
            return
        }

        console.log(`🔄 Updating Medusa payment_session: ${result.data.session_id}`)

        const paymentSession = await paymentModuleService.retrievePaymentSession(result.data.session_id as string)

        await paymentModuleService.updatePaymentSession({
            id: result.data.session_id as string,
            data: result.data,
            status: status as any,
            currency_code: paymentSession.currency_code,
            amount: result.data.amount as any,
        })

        res.status(200).json({ received: true })

    } catch (err: any) {
        console.error("🔥 RinggitPay webhook error:", err)
        res.status(500).json({ error: err.message })
    }
}
