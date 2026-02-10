import { AbstractPaymentProvider, BigNumber } from "@medusajs/framework/utils";
import {
    AuthorizePaymentInput,
    AuthorizePaymentOutput,
    PaymentSessionStatus,
    CancelPaymentInput,
    CancelPaymentOutput,
    CapturePaymentInput,
    CapturePaymentOutput,
    DeletePaymentInput,
    DeletePaymentOutput,
    GetPaymentStatusInput,
    GetPaymentStatusOutput,
    InitiatePaymentInput,
    InitiatePaymentOutput,
    RefundPaymentInput,
    RefundPaymentOutput,
    RetrievePaymentInput,
    RetrievePaymentOutput,
    UpdatePaymentInput,
    UpdatePaymentOutput,
    WebhookActionResult,
    ProviderWebhookPayload,
} from "@medusajs/framework/types";
import axios from "axios";
import { HitpayPaymentContext } from "../types/hitpay-context"

type Options = {
    apiKey: string;
};

class HitpayPaymentProviderService extends AbstractPaymentProvider<Options> {
    static identifier = "hitpay";
    protected options_: Options;
    protected baseUrl: string;
    protected client: any; // optional: your HTTP client for HitPay

    constructor(container: any, options: Options) {
        super(container, options);
        this.options_ = options;
        this.baseUrl = "https://api.hit-pay.com/v1"; // adjust for sandbox/production
        this.client = axios;
    }


    // async initiatePayment(input: InitiatePaymentInput & { context: HitpayPaymentContext }): Promise<InitiatePaymentOutput> {
    //     const { amount, currency_code } = input
    //     const orderId = input.data?.order_id || `temp_${Date.now()}`; // fallback
    //     const email = String(input.data?.customer_email ?? "guest@example.com");
    //     const amountNumber = Number(amount)
    //     const amountInUnits = amountNumber.toFixed(2)
    //     if (Number(amountInUnits) < 0.3) throw new Error("Amount too low for HitPay")

    //     const frontendDomain = "https://shop.everbrightltd.com"
    //     const backendDomain = "https://backend-production-4e31.up.railway.app"

    //     const redirectUrl = `${frontendDomain}/account/orders/${orderId}/completed`
    //     const webhookUrl = `${backendDomain}/api/webhooks/hitpay`

    //     const res = await axios.post(
    //         `${this.baseUrl}/payment-requests`,
    //         new URLSearchParams({
    //             amount: amountInUnits,
    //             currency: currency_code.toUpperCase(),
    //             email: email,
    //             reference_number: `medusa_${Date.now()}`,
    //             redirect_url: redirectUrl,
    //             webhook: webhookUrl,
    //             metadata: JSON.stringify({ session_id: orderId }),
    //         }),
    //         {
    //             headers: {
    //                 "X-BUSINESS-API-KEY": this.options_.apiKey,
    //                 "Content-Type": "application/x-www-form-urlencoded"
    //             }
    //         }
    //     )

    //     return {
    //         id: res.data.id,
    //         data: { ...res.data, payment_url: res.data.payment_url || res.data.url || res.data.redirect_url },
    //         status: "pending"
    //     }
    // }
    async initiatePayment(
        input: InitiatePaymentInput & { context: HitpayPaymentContext }
    ): Promise<InitiatePaymentOutput> {
        const { amount, currency_code } = input;
        console.log("HitPay InitiatePayment Input:", JSON.stringify(input, null, 2));

        const orderId = String(input.data?.order_id || `temp_${Date.now()}`);
        const email = input.data?.customer_email ? String(input.data.customer_email) : undefined;

        const amountNumber = Number(amount);
        const amountInUnits = amountNumber.toFixed(2);

        if (amountNumber < 0.3) {
            throw new Error("Amount too low for HitPay");
        }

        // -----------------------------------------------------
        // FRONTEND + BACKEND DOMAINS
        // -----------------------------------------------------
        // -----------------------------------------------------
        // FRONTEND + BACKEND DOMAINS
        // -----------------------------------------------------
        const frontendDomain = process.env.STORE_URL ? (process.env.STORE_URL.startsWith('http') ? process.env.STORE_URL : `https://${process.env.STORE_URL}`) : "http://localhost:8000";
        const backendDomain = process.env.BACKEND_URL ? (process.env.BACKEND_URL.startsWith('http') ? process.env.BACKEND_URL : `https://${process.env.BACKEND_URL}`) : "http://localhost:9000";

        // -----------------------------------------------------
        // COUNTRY CODE LOGIC (comes from shipping address)
        // -----------------------------------------------------
        // Must match your frontend route: /[CountryCode]/order/confirmed/[id]
        const countryCode =
            "sg";
        const cartId = (input.context as any).resource_id || (input.data as any)?.context?.cart_id || (input.data as any)?.cart_id || "";
        const redirectUrl = orderId.startsWith("temp_")
            ? `${frontendDomain}/${countryCode}/checkout?step=review${cartId ? `&cart_id=${cartId}` : ""}`
            : `${frontendDomain}/${countryCode}/order/confirmed/${orderId}`;
        // Medusa v2 file-based routing: /webhooks/hitpay maps to src/api/webhooks/hitpay.ts
        const webhookUrl = `${backendDomain}/webhooks/hitpay`;
        const params = new URLSearchParams();
        params.append("amount", amountInUnits);
        params.append("currency", currency_code.toUpperCase());
        if (email) {
            params.append("email", email);
        }
        params.append("reference_number", `medusa_${Date.now()}`);
        params.append("redirect_url", redirectUrl);
        params.append("webhook", webhookUrl);
        params.append("metadata", JSON.stringify({ session_id: orderId }));

        try {
            const res = await axios.post(`${this.baseUrl}/payment-requests`, params, {
                headers: {
                    "X-BUSINESS-API-KEY": this.options_.apiKey,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept-Encoding": "identity",
                },
            });

            // -----------------------------------------------------
            // RETURN MEDUSA PAYMENT SESSION
            // -----------------------------------------------------
            return {
                id: res.data.id,
                data: {
                    ...res.data,
                    payment_url:
                        res.data.payment_url || res.data.url || res.data.redirect_url,
                },
                status: "pending",
            };
        } catch (error) {
            console.error("HitPay initiatePayment error:", error);
            if (axios.isAxiosError(error)) {
                console.error("Response data:", error.response?.data);
                console.error("Response status:", error.response?.status);
                console.error("Response headers:", error.response?.headers);
            }
            throw error;
        }
    }

    async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
        return {
            data: input.data ?? {},
            status: "authorized",
        };
    }

    async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
        return {
            data: input.data ?? {},

        };
    }

    async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
        return {
            data: input.data ?? {},

        };
    }

    async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
        return {
            data: input.data ?? {},

        };
    }

    async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
        return {
            data: input.data ?? {},

        };
    }

    async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
        const externalId = input.data?.id;
        if (!externalId) {
            return { status: "pending", data: {} };
        }

        const res = await axios.get(`${this.baseUrl}/payment-requests/${externalId}`, {
            headers: { "X-BUSINESS-API-KEY": this.options_.apiKey },
        });

        let status: "pending" | "authorized" | "captured" | "canceled" | "requires_action" = "pending";
        switch (res.data.status) {
            case "pending":
                status = "pending";
                break;
            case "completed":
                status = "captured";
                break;
            case "canceled":
            case "failed":
                status = "canceled";
                break;
            default:
                status = "pending";
        }

        return {
            data: res.data,
            status,
        };
    }

    async getWebhookActionAndData(
        payload: ProviderWebhookPayload["payload"]
    ): Promise<WebhookActionResult> {
        const {
            data,
            rawData,
            headers
        } = payload

        try {
            switch (data.event_type) {
                case "authorized_amount":
                    return {
                        action: "authorized",
                        data: {
                            // assuming the session_id is stored in the metadata of the payment
                            // in the third-party provider
                            session_id: (data.metadata as Record<string, any>).session_id,
                            amount: new BigNumber(data.amount as number)
                        }
                    }
                case "success":
                    return {
                        action: "captured",
                        data: {
                            // assuming the session_id is stored in the metadata of the payment
                            // in the third-party provider
                            session_id: (data.metadata as Record<string, any>).session_id,
                            amount: new BigNumber(data.amount as number)
                        }
                    }
                default:
                    return {
                        action: "not_supported",
                        data: {
                            session_id: "",
                            amount: new BigNumber(0)
                        }
                    }
            }
        } catch (e) {
            return {
                action: "failed",
                data: {
                    // assuming the session_id is stored in the metadata of the payment
                    // in the third-party provider
                    session_id: (data.metadata as Record<string, any>).session_id,
                    amount: new BigNumber(data.amount as number)
                }
            }
        }
    }





    async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
        throw new Error("Method not implemented");
    }

    async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
        throw new Error("Method not implemented");
    }
}

export default HitpayPaymentProviderService;
