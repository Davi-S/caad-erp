/**
 * Reporting Analytics tRPC router exposing analytical reporting queries used by the UI.
 */

import { calculateInventory } from "../../bll/index.js"
import { publicProcedure, router } from "../trpc.js"

export const reportsRouter = router({
    /**
     * Returns current on-hand inventory stock count per product ID.
     */
    inventory: publicProcedure.query(({ ctx }) => {
        return calculateInventory(ctx.db)
    }),
})
