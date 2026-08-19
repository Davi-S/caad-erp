/**
 * Salesmen tRPC router exposing procedures for salesman team querying and modification.
 */

import { z } from "zod"
import {
    addSalesman,
    addSalesmanSchema,
    getSalesman,
    getSalesmanSchema,
    listSalesmen,
    updateSalesman,
    updateSalesmanSchema,
} from "../../bll/index.js"
import { publicProcedure, router } from "../trpc.js"

export const salesmenRouter = router({
    /**
     * Retrieves all salesman records from the team list.
     */
    list: publicProcedure.query(({ ctx }) => {
        return listSalesmen(ctx.db)
    }),

    /**
     * Retrieves a single salesman record by identifier.
     */
    get: publicProcedure.input(getSalesmanSchema).query(({ ctx, input }) => {
        return getSalesman(ctx.db, input.id)
    }),

    /**
     * Registers a new salesman in the team list.
     */
    add: publicProcedure.input(addSalesmanSchema).mutation(({ ctx, input }) => {
        return addSalesman(ctx.db, input)
    }),

    /**
     * Modifies an existing salesman record in the team list.
     */
    update: publicProcedure
        .input(
            z.object({
                id: z.string().trim().min(1, "Salesman ID is required"),
                data: updateSalesmanSchema,
            }),
        )
        .mutation(({ ctx, input }) => {
            return updateSalesman(ctx.db, input.id, input.data)
        }),
})
