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

export default async function Checkout() {
  const cart = await fetchCart()
  const customer = await getCustomer()

  if (!cart) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-y-4">
        <h1 className="text-2xl font-bold text-ui-fg-base">Cart not found</h1>
        <p className="text-ui-fg-subtle">
          If you just completed a payment, your order might be processing.
          Please check your email for confirmation or visit your account page.
        </p>
        <a href="/" className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover">
          Back to store
        </a>
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
