/**
 * Products tRPC router exposing procedures for catalog querying and modification.
 */

import { z } from "zod"
import {
    addProduct,
    addProductSchema,
    getProduct,
    getProductSchema,
    listProducts,
    updateProduct,
    updateProductSchema,
} from "../../bll/index.js"
import { publicProcedure, router } from "../trpc.js"

export const productsRouter = router({
    /**
     * Retrieves all product records from the catalog.
     */
    list: publicProcedure.query(({ ctx }) => {
        return listProducts(ctx.db)
    }),

    /**
     * Retrieves a single product record by identifier.
     */
    get: publicProcedure.input(getProductSchema).query(({ ctx, input }) => {
        return getProduct(ctx.db, input.productId)
    }),

    /**
     * Registers a new product in the catalog.
     */
    add: publicProcedure.input(addProductSchema).mutation(({ ctx, input }) => {
        return addProduct(ctx.db, input)
    }),

    /**
     * Modifies an existing product record in the catalog.
     */
    update: publicProcedure
        .input(
            z.object({
                productId: z.string().trim().min(1, "Product ID is required"),
                data: updateProductSchema,
            }),
        )
        .mutation(({ ctx, input }) => {
            return updateProduct(ctx.db, input.productId, input.data)
        }),
})
