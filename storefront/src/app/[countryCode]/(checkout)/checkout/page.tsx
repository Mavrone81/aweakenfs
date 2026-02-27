import { Metadata } from "next"
import { notFound } from "next/navigation"

import Wrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { enrichLineItems, retrieveCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { getCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Checkout",
}

const fetchCart = async () => {
  const cart = await retrieveCart()
  if (!cart) {
    // If we're coming back from a payment gateway, the cart might have been completed already.
    // In a production app, we might redirect to a generic order success or order lookup page.
    return null
  }

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart?.items, cart?.region_id!)
    cart.items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  return cart
}

import { redirect } from "next/navigation"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

export default async function Checkout({
  params,
  searchParams,
}: {
  params: { countryCode: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const { countryCode } = params
  const rpStatusCode = searchParams.rp_statusCode
  const cartIdParam = searchParams.cart_id as string | undefined

  // 1. Handle Success Redirect from RinggitPay
  if (rpStatusCode === "RP00" && cartIdParam) {
    try {
      // Try to complete the cart if it's not already completed
      const cartRes = await sdk.store.cart
        .complete(cartIdParam, {}, getAuthHeaders())
        .catch(() => null)

      if (cartRes?.type === "order") {
        return redirect(`/${countryCode}/order/confirmed/${cartRes.order.id}`)
      }

      // If cart is already completed, find the order by cart_id
      // @ts-ignore
      const { orders } = await sdk.store.order.list(
        { cart_id: [cartIdParam] },
        getAuthHeaders()
      )
      if (orders?.length > 0) {
        return redirect(`/${countryCode}/order/confirmed/${orders[0].id}`)
      }
    } catch (error) {
      console.error("Error completing cart or finding order:", error)
    }
  }

  // 2. Handle Failure Redirect from RinggitPay
  if (rpStatusCode && rpStatusCode !== "RP00") {
    const errorMsg = searchParams.rp_statusMsg || "Payment was unsuccessful"
    return redirect(`/${countryCode}/order/failed?reason=${encodeURIComponent(errorMsg as string)}`)
  }

  const cart = await fetchCart()
  const customer = await getCustomer()

  if (!cart) {
    // Check one more time if an order exists for the current cart ID if we have one in params
    if (cartIdParam) {
      // @ts-ignore
      const { orders } = await sdk.store.order.list(
        { cart_id: [cartIdParam] },
        getAuthHeaders()
      )
      if (orders?.length > 0) {
        return redirect(`/${countryCode}/order/confirmed/${orders[0].id}`)
      }
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-y-4 text-center">
        <h1 className="text-2xl font-bold text-ui-fg-base">Cart not found</h1>
        <p className="text-ui-fg-subtle max-w-[400px]">
          If you just completed a payment, your order might be processing.
          Please check your email for confirmation or visit your account page.
        </p>
        <div className="flex gap-x-4 mt-4">
          <a href="/" className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover">
            Back to store
          </a>
          <a href={`/${countryCode}/account/orders`} className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover">
            View my orders
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <Wrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
      </Wrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}
