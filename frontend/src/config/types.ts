export interface AppConfig {
    /** Delay in milliseconds before automatically resetting the POS to a new sale after payment (0 = disabled). */
    autoStartNewSaleTimeoutMs: number
    /** Delimiter string used to cluster product variations into single cards. */
    productGroupingDelimiter: string
    /** Format template string sent for the PIX payment description (supports {salesmanName}). */
    pixDescriptionTemplate: string
    /** Suggested filename when downloading the Excel analytical workbook. */
    excelDefaultFilename: string
}
