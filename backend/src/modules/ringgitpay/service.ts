import { AbstractPaymentProvider, BigNumber } from "@medusajs/framework/utils";
console.log("[RinggitPay] Service file evaluated");

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
import crypto from "crypto";

type Options = {
    appId: string;
    requestKey: string;
    responseKey: string;
    isSandbox?: boolean;
};

class RinggitPayProviderService extends AbstractPaymentProvider<Options> {
    static identifier = "ringgitpay";
    protected options_: Options;
    protected baseUrl: string;

    constructor(container: any, options: Options) {
        super(container, options);
        this.options_ = options;
        this.baseUrl = options.isSandbox
            ? "https://ringgitpay.co/payment"
            : "https://ringgitpay.com/payment";
    }

    private generateChecksum(data: string): string {
        return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
    }

    private verifyResponseChecksum(params: Record<string, any>): boolean {
        const {
            rp_appId,
            rp_currency,
            rp_amount,
            rp_statusCode,
            rp_orderId,
            rp_transactionRef,
            rp_checkSum
        } = params;

        const sourceString = `${rp_appId}|${rp_currency}|${rp_amount}|${rp_statusCode}|${rp_orderId}|${rp_transactionRef}|${this.options_.responseKey}`;
        const calculatedChecksum = this.generateChecksum(sourceString);

        return calculatedChecksum === rp_checkSum;
    }

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
        const { amount, currency_code, data: paymentData } = input;
        const context = (input as any).context || {};

        const orderId = String(paymentData?.order_id || `temp_${Date.now()}`);
        const cartId = context.resource_id || (paymentData as any)?.cart_id || "";
        const email = context.email || (paymentData as any)?.customer?.email || "";

        // RinggitPay requires amount in decimal format (e.g., 100.00)
        const amountString = Number(amount).toFixed(2);

        const sourceString = `${this.options_.appId}|${currency_code.toUpperCase()}|${amountString}|${orderId}|${this.options_.requestKey}`;
        const checkSum = this.generateChecksum(sourceString);

        // Map frontend return URL
        const storefrontURL = process.env.STORE_URL ? (process.env.STORE_URL.startsWith('http') ? process.env.STORE_URL : `https://${process.env.STORE_URL}`) : "http://localhost:8000";
        const countryCode = "my"; // Default country code

        // Use checkout review for temp orders to allow cart completion, same as HitPay
        const returnURL = orderId.startsWith("temp_")
            ? `${storefrontURL}/${countryCode}/checkout?step=review${cartId ? `&cart_id=${cartId}` : ""}`
            : `${storefrontURL}/${countryCode}/order/confirmed/${orderId}`;

        return {
            id: orderId,
            data: {
                ...paymentData,
                appId: this.options_.appId,
                currency: currency_code.toUpperCase(),
                amount: amountString,
                orderId: orderId,
                checkSum: checkSum,
                returnURL: returnURL,
                buyerEmail: email,
                accName: (paymentData as any)?.customer?.first_name ? `${(paymentData as any).customer.first_name} ${(paymentData as any).customer.last_name}` : "Customer",
                payment_url: this.baseUrl
            },
            status: "pending"
        };
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
        // Status is usually updated via webhook or enquiry
        return {
            data: input.data ?? {},
            status: "pending",
        };
    }

    async getWebhookActionAndData(
        payload: ProviderWebhookPayload["payload"]
    ): Promise<WebhookActionResult> {
        const { data } = payload;

        if (!this.verifyResponseChecksum(data)) {
            return {
                action: "failed",
                data: {
                    session_id: (data.rp_orderId as string) || "",
                    amount: new BigNumber(0)
                }
            };
        }

        const statusCode = data.rp_statusCode as string;

        // RP00 is success, IR10-IR20/RP91-RP97 are failures, RP09 is pending
        if (statusCode === "RP00") {
            return {
                action: "captured",
                data: {
                    session_id: data.rp_orderId as string,
                    amount: new BigNumber(data.rp_amount as number)
                }
            };
        } else if (statusCode === "RP09") {
            return {
                action: "not_supported", // Keep pending
                data: {
                    session_id: data.rp_orderId as string,
                    amount: new BigNumber(data.rp_amount as number)
                }
            };
        }

        return {
            action: "failed",
            data: {
                session_id: data.rp_orderId as string,
                amount: new BigNumber(data.rp_amount as number)
            }
        };
    }

    async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
        return {
            data: input.data ?? {},
        };
    }

    async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
        return {
            data: input.data ?? {},
        };
    }
}

export default RinggitPayProviderService;
