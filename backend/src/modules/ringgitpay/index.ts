import { ModuleProviderExports } from '@medusajs/framework/types'
import RinggitPayProviderService from "./service"

const services = [RinggitPayProviderService]

const providerExport: ModuleProviderExports = {
    services,
}

export default providerExport
