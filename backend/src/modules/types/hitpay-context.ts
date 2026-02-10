// types/hitpay-context.ts
import { PaymentProviderContext } from "@medusajs/framework/types"

export type HitpayPaymentContext = PaymentProviderContext & {
 order_id: string        // the Medusa order ID
  customer?: { email?: string }
}
