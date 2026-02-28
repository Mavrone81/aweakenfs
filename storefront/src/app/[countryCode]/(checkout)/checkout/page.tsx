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
import { getAuthHeaders, getCartId } from "@lib/data/cookies"

export default async function Checkout({
  params,
  searchParams,
}: {
  params: { countryCode: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const { countryCode } = params
  const cartIdParam = searchParams.cart_id as string | undefined

  const cart = await fetchCart()
  const customer = await getCustomer()

  if (!cart) {
    // Check one more time if an order exists for the current cart ID if we have one in params or cookies
    const cartIdCookie = getCartId()
    const effectiveCartId = cartIdParam || cartIdCookie

    if (effectiveCartId && customer) {
      try {
        // Since cart_id is not a valid filter for orders in Store API, 
        // we fetch the customer's most recent order and check if it was created very recently.
        const { orders } = await sdk.store.order.list(
          {
            limit: 1,
            fields: "+created_at",
            // @ts-ignore - Some versions support ordering by created_at natively
            order: "-created_at"
          },
          getAuthHeaders()
        )

        if (orders?.length > 0) {
          const latestOrder = orders[0]
          // Optional: Verify if the order is recent (e.g., created within the last 30 minutes)
          const orderDate = new Date(latestOrder.created_at as string).getTime()
          const now = new Date().getTime()
          const diffMinutes = (now - orderDate) / (1000 * 60)

          if (diffMinutes < 30) {
            return redirect(`/${countryCode}/order/confirmed/${latestOrder.id}`)
          }
        }
      } catch (e) {
        console.error("Error looking up recent order fallback:", e)
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
