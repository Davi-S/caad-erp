/**
 * Main application tRPC root router combining feature sub-routers.
 */

import { router } from "../trpc.js"
import { productsRouter } from "./products.js"
import { reportsRouter } from "./reports.js"
import { salesmenRouter } from "./salesmen.js"
import { transactionsRouter } from "./transactions.js"

/**
 * Primary combined tRPC app router instance.
 */
export const appRouter = router({
    products: productsRouter,
    salesmen: salesmenRouter,
    transactions: transactionsRouter,
    reports: reportsRouter,
})

/**
 * Exported type definition of the complete AppRouter for frontend client consumption.
 */
export type AppRouter = typeof appRouter
