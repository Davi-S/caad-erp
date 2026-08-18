/**
 * Reporting Analytics tRPC router exposing analytical reporting queries used by the UI.
 */

import {
    calculateInventory,
    calculateNetProfit,
    calculateOutstandingDebts,
    calculateTotalCost,
    calculateTotalRevenue,
} from "../../bll/index.js"
import { publicProcedure, router } from "../trpc.js"

export const reportsRouter = router({
    /**
     * Returns current on-hand inventory stock count per product ID.
     */
    inventory: publicProcedure.query(({ ctx }) => {
        return calculateInventory(ctx.db)
    }),

    /**
     * Returns total gross sales revenue.
     */
    totalRevenue: publicProcedure.query(({ ctx }) => {
        return calculateTotalRevenue(ctx.db)
    }),

    /**
     * Returns total restock spend cost.
     */
    totalCost: publicProcedure.query(({ ctx }) => {
        return calculateTotalCost(ctx.db)
    }),

    /**
     * Returns net profit (revenue + cost).
     */
    netProfit: publicProcedure.query(({ ctx }) => {
        return calculateNetProfit(ctx.db)
    }),

    /**
     * Returns outstanding credit balances report.
     */
    outstandingDebts: publicProcedure.query(({ ctx }) => {
        return calculateOutstandingDebts(ctx.db)
    }),
})
