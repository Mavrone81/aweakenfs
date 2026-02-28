import { Heading, Text, Button, Container } from "@medusajs/ui"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Payment Unsuccessful",
    description: "There was an issue processing your payment.",
}

export default function RinggitPayFailedPage({
    searchParams,
    params,
}: {
    searchParams: { reason?: string; statusCode?: string; transactionId?: string; orderId?: string }
    params: { countryCode: string }
}) {
    const { reason, statusCode, transactionId, orderId } = searchParams
    const { countryCode } = params

    const displayReason = reason || "The payment was declined or cancelled by the user."

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-y-6 text-center content-container py-12 bg-ui-bg-subtle">
            <Container className="max-w-[600px] w-full p-8 flex flex-col items-center gap-y-8 bg-ui-bg-base shadow-elevation-card-rest rounded-xl border border-ui-border-base">

                <div className="flex flex-col items-center gap-y-4">
                    <div className="bg-red-100 rounded-full p-4 mb-2">
                    </div>
                    <Heading level="h1" className="text-3xl font-semibold text-ui-fg-error">
                        Payment Unsuccessful
                    </Heading>
                    <Text className="text-ui-fg-subtle text-base max-w-[400px]">
                        We're sorry, but your transaction could not be completed securely at this time.
                    </Text>
                </div>

                <div className="w-full flex flex-col gap-y-4 border-y border-ui-border-base py-6 my-2 text-left bg-ui-bg-subtle p-6 rounded-lg">
                    <Heading level="h2" className="text-lg font-medium text-ui-fg-base mb-2">
                        Error Details
                    </Heading>

                    <div className="flex flex-col sm:flex-row justify-between sm:items-center text-sm gap-y-1">
                        <Text className="text-ui-fg-subtle font-medium">Reason</Text>
                        <Text className="font-medium text-ui-fg-error text-right">{displayReason}</Text>
                    </div>

                    {statusCode && (
                        <div className="flex justify-between items-center text-sm">
                            <Text className="text-ui-fg-subtle">Status Code</Text>
                            <Text className="font-mono text-ui-fg-muted">{statusCode}</Text>
                        </div>
                    )}

                    {orderId && (
                        <div className="flex justify-between items-center text-sm">
                            <Text className="text-ui-fg-subtle">Reference ID</Text>
                            <Text className="font-mono text-ui-fg-muted">{orderId}</Text>
                        </div>
                    )}

                    {transactionId && (
                        <div className="flex justify-between items-center text-sm">
                            <Text className="text-ui-fg-subtle">Gateway ID</Text>
                            <Text className="font-mono text-ui-fg-muted">{transactionId}</Text>
                        </div>
                    )}
                </div>

                <Text className="text-ui-fg-muted text-sm px-4">
                    No charges were made to your account for this transaction. Feel free to try again using a different payment method.
                </Text>

                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-2">
                    <a href={`/${countryCode}/checkout?step=review`}>
                        <Button variant="primary" className="w-full sm:w-auto">
                            Try Again
                        </Button>
                    </a>
                    <a href={`/${countryCode}/store`}>
                        <Button variant="secondary" className="w-full sm:w-auto">
                            Return to Store
                        </Button>
                    </a>
                </div>
            </Container>
        </div>
    )
}
