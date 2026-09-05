import defaultConfig from "./default-config.json"
import type { AppConfig } from "./types"

export const DEFAULT_CONFIG: AppConfig = {
    autoStartNewSaleTimeoutMs: defaultConfig.autoStartNewSaleTimeoutMs,
    productGroupingDelimiter: defaultConfig.productGroupingDelimiter,
    pixDescriptionTemplate: defaultConfig.pixDescriptionTemplate,
    excelDefaultFilename: defaultConfig.excelDefaultFilename,
}
