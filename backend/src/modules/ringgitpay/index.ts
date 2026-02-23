import { ModuleProviderExports } from '@medusajs/framework/types'
import MyPaymentProviderService from "./service"

const services = [MyPaymentProviderService]

const providerExport: ModuleProviderExports = {
    services,
}

export default providerExport
