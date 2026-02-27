import { Heading, Text } from "@medusajs/ui"
import InteractiveLink from "@modules/common/components/interactive-link"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Payment Unsuccessful",
    description: "There was an issue processing your payment",
}

export default function OrderFailedPage({
    searchParams,
}: {
    searchParams: { reason?: string }
}) {
    const reason = searchParams.reason || "The payment was declined or cancelled."

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-y-6 text-center content-container">
            <div className="max-w-[500px] flex flex-col gap-y-4">
                <Heading level="h1" className="text-3xl font-bold flex items-center justify-center gap-x-2 text-ui-fg-error">
                    Payment Unsuccessful
                </Heading>
                <Text className="text-ui-fg-subtle text-lg">
                    We're sorry, but we couldn't process your payment at this time.
                </Text>
                <div className="bg-ui-bg-subtle p-6 rounded-lg border border-ui-border-base mt-4">
                    <Text className="font-mono text-sm text-ui-fg-base">
                        Reason: {reason}
                    </Text>
                </div>
                <Text className="text-ui-fg-muted text-sm mt-2">
                    If money was deducted from your account, please contact our support with your cart ID.
                </Text>
            </div>
            <div className="flex flex-col gap-y-4 mt-4">
                <InteractiveLink href="/checkout">
                    Try again
                </InteractiveLink>
                <InteractiveLink href="/">
                    Back to store
                </InteractiveLink>
            </div>
        </div>
    )
}
