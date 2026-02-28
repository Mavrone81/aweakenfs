import { NextRequest, NextResponse } from "next/server"

// RinggitPay sends a POST request back to the returnURL
export async function POST(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams
        const countryCode = searchParams.get("countryCode") || "my"

        // Parse the form data from the POST request
        const formData = await req.formData()

        // Extract RinggitPay response fields
        const rpStatusCode = formData.get("rp_statusCode")?.toString() || ""
        const rpStatusMsg = formData.get("rp_statusMsg")?.toString() || ""
        const transactionId = formData.get("rp_transactionRef")?.toString() || ""
        const orderId = formData.get("rp_orderId")?.toString() || ""
        const amount = formData.get("rp_amount")?.toString() || ""

        // Build the redirect URL with the extracted parameters as query strings
        // so the Next.js page can read them.
        const baseUrl = req.nextUrl.origin

        if (rpStatusCode === "RP00") {
            // Payment Success
            const redirectUrl = new URL(`/${countryCode}/ringgitpay/success`, baseUrl)
            redirectUrl.searchParams.set("transactionId", transactionId)
            redirectUrl.searchParams.set("orderId", orderId)
            redirectUrl.searchParams.set("amount", amount)
            return NextResponse.redirect(redirectUrl, 303) // 303 See Other is correct for POST-to-GET redirects
        } else {
            // Payment Failed
            const redirectUrl = new URL(`/${countryCode}/ringgitpay/failed`, baseUrl)
            redirectUrl.searchParams.set("reason", rpStatusMsg)
            redirectUrl.searchParams.set("statusCode", rpStatusCode)
            redirectUrl.searchParams.set("transactionId", transactionId)
            redirectUrl.searchParams.set("orderId", orderId)
            return NextResponse.redirect(redirectUrl, 303)
        }
    } catch (error) {
        console.error("Error processing RinggitPay POST callback:", error)
        // Fallback redirect
        const baseUrl = req.nextUrl.origin
        return NextResponse.redirect(new URL(`/my/checkout`, baseUrl), 303)
    }
}
