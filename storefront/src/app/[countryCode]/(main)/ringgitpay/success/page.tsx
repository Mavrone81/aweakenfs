import { Heading, Text, Button, Container } from "@medusajs/ui"
import InteractiveLink from "@modules/common/components/interactive-link"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Payment Successful",
    description: "Your payment was processed successfully.",
}

export default function RinggitPaySuccessPage({
    searchParams,
    params,
}: {
    searchParams: { transactionId?: string; orderId?: string; amount?: string }
    params: { countryCode: string }
}) {
    const { transactionId, orderId, amount } = searchParams
    const { countryCode } = params

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-y-6 text-center content-container py-12 bg-ui-bg-subtle">
            <Container className="max-w-[600px] w-full p-8 flex flex-col items-center gap-y-8 bg-ui-bg-base shadow-elevation-card-rest rounded-xl border border-ui-border-base">

                <div className="flex flex-col items-center gap-y-4">
                    <div className="bg-ui-bg-interactive rounded-full p-4 mb-2">
                    </div>
                    <Heading level="h1" className="text-3xl font-semibold text-ui-fg-base">
                        Payment Successful!
                    </Heading>
                    <Text className="text-ui-fg-subtle text-base max-w-[400px]">
                        Thank you for your purchase. Your payment has been securely processed by RinggitPay.
                    </Text>
                </div>

                <div className="w-full flex flex-col gap-y-4 border-y border-ui-border-base py-6 my-2 text-left">
                    <Heading level="h2" className="text-xl font-medium text-ui-fg-base mb-2">
                        Transaction Receipt
                    </Heading>

                    <div className="flex justify-between items-center text-sm">
                        <Text className="text-ui-fg-subtle">Date</Text>
                        <Text className="font-medium text-ui-fg-base">{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                        <Text className="text-ui-fg-subtle">Reference ID</Text>
                        <Text className="font-mono font-medium text-ui-fg-base">{orderId || "N/A"}</Text>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                        <Text className="text-ui-fg-subtle">Transaction ID</Text>
                        <Text className="font-mono font-medium text-ui-fg-base">{transactionId || "N/A"}</Text>
                    </div>

                    <div className="flex justify-between items-center text-sm mt-4 pt-4 border-t border-ui-border-base">
                        <Text className="text-ui-fg-base font-semibold">Amount Paid</Text>
                        <Text className="font-semibold text-lg text-ui-fg-interactive">MYR {amount || "0.00"}</Text>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-2">
                    <a href={`/${countryCode}/account/orders`}>
                        <Button variant="secondary" className="w-full sm:w-auto">
                            View My Orders
                        </Button>
                    </a>
                    <a href={`/${countryCode}/store`}>
                        <Button variant="primary" className="w-full sm:w-auto">
                            Continue Shopping
                        </Button>
                    </a>
                </div>
            </Container>
        </div>
    )
}
