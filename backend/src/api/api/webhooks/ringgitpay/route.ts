import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import RinggitPayProviderService from "../../../../modules/ringgitpay/service"
import {
    RINGGITPAY_APP_ID,
    RINGGITPAY_REQUEST_KEY,
    RINGGITPAY_RESPONSE_KEY,
    RINGGITPAY_IS_SANDBOX
} from "../../../../lib/constants"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const container = req.scope
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
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

        const referenceId = result.data.session_id as string

        /**
         * SAFE: Ensure referenceId exists
         */
        if (!referenceId) {
            console.warn("⚠️ RinggitPay webhook missing orderId/referenceId. Skipping update.")
            res.status(200).json({ received: true })
            return
        }

        console.log(`🔄 Processing RinggitPay reference: ${referenceId}`)

        let cartId: string | undefined
        let sessionId: string | undefined

        // Resolve Cart ID and Session ID based on the prefix
        if (referenceId.startsWith("cart_")) {
            cartId = referenceId
            console.log(`📦 Reference is a Cart ID: ${cartId}`)
            
            // Find the payment session for this cart
            const { data: [cartData] } = await query.graph({
                entity: "cart",
                fields: ["id", "completed_at", "payment_collection.payment_sessions.id", "payment_collection.payment_sessions.provider_id"],
                filters: { id: cartId }
            })
            
            if (cartData) {
                const rpSession = cartData.payment_collection?.payment_sessions?.find((s: any) => s.provider_id === "ringgitpay")
                sessionId = rpSession?.id
                if (!sessionId) {
                    console.warn(`⚠️ Could not find RinggitPay session for Cart: ${cartId}`)
                }
            }
        } else if (referenceId.startsWith("paysess_")) {
            sessionId = referenceId
            console.log(`💳 Reference is a Payment Session ID: ${sessionId}`)
        } else {
            // Fallback for temp_ IDs or others
            sessionId = referenceId
            console.log(`❓ Reference is a generic ID: ${sessionId}`)
        }

        if (sessionId) {
            console.log(`🔄 Updating Medusa payment_session: ${sessionId}`)
            const paymentSession = await paymentModuleService.retrievePaymentSession(sessionId)
            await paymentModuleService.updatePaymentSession({
                id: sessionId,
                data: result.data,
                status: status as any,
                currency_code: paymentSession.currency_code,
                amount: result.data.amount as any,
            })
        }

        /**
         * COMPLETE CART: If payment was successful, attempt to create the order
         */
        if (status === "captured" || status === "authorized") {
            try {
                // If we don't have a cartId yet (e.g. we started with a sessionId), find it now
                if (!cartId && sessionId) {
                    console.log(`🔍 Finding Cart for Payment Session: ${sessionId}`)
                    const { data: [cartData] } = await query.graph({
                        entity: "cart",
                        fields: ["id", "completed_at"],
                        filters: {
                            payment_collection: {
                                payment_sessions: {
                                    id: sessionId
                                }
                            }
                        }
                    })
                    cartId = cartData?.id
                }

                if (cartId) {
                    // Check if already completed to avoid redundant workflow calls
                    const { data: [finalCart] } = await query.graph({
                        entity: "cart",
                        fields: ["id", "completed_at"],
                        filters: { id: cartId }
                    })

                    if (finalCart && !finalCart.completed_at) {
                        console.log(`🚀 Triggering completeCartWorkflow for Cart: ${cartId}`)
                        await completeCartWorkflow(container).run({
                            input: {
                                id: cartId
                            }
                        })
                        console.log(`✅ Order successfully created for Cart: ${cartId}`)
                    } else if (finalCart?.completed_at) {
                        console.log(`ℹ️ Cart ${cartId} already completed. Skipping workflow.`)
                    }
                } else {
                    console.warn(`⚠️ Could not determine Cart ID for reference ${referenceId}`)
                }
            } catch (workflowError: any) {
                console.error("❌ Failed to complete cart via workflow:", workflowError.message)
            }
        }

        res.status(200).json({ received: true })

    } catch (err: any) {
        console.error("🔥 RinggitPay webhook error:", err)
        res.status(500).json({ error: err.message })
    }
}
