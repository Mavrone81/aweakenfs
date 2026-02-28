import { NextRequest, NextResponse } from "next/server"

// RinggitPay sends a POST request back to the returnURL
export async function POST(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams
        const countryCode = searchParams.get("countryCode") || "my"

        // Parse the form data from the POST request
        const formData = await req.formData()

        // Detailed logging for UAT Sign-Off 
        console.log("=========================================")
        console.log("✅ RAW RINGGITPAY REDIRECT RESPONSE DATA ✅")
        console.log(JSON.stringify(Object.fromEntries(formData.entries()), null, 2))
        console.log("=========================================")

        // Extract RinggitPay response fields
        const rpStatusCode = formData.get("rp_statusCode")?.toString() || ""
        const rpStatusMsg = formData.get("rp_statusMsg")?.toString() || ""
        const transactionId = formData.get("rp_transactionRef")?.toString() || ""
        const orderId = formData.get("rp_orderId")?.toString() || ""
        const amount = formData.get("rp_amount")?.toString() || ""

        // Build the redirect URL with the extracted parameters as query strings
        // so the Next.js page can read them. Using headers to avoid internal proxy localhost URLs.
        const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host")
        const forwardedProto = req.headers.get("x-forwarded-proto") || "https"
        const fallbackUrl = process.env.NEXT_PUBLIC_MEDUSA_FRONTEND_URL || "http://localhost:8000"

        const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : fallbackUrl

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
