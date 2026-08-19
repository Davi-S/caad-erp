/**
 * Transactions tRPC router exposing procedures for ledger logging and query operations.
 */

import { z } from "zod"
import {
    creditPaymentCommandSchema,
    getTransaction,
    getTransactionSchema,
    listTransactions,
    recordBulkSale,
    recordCreditPayment,
    recordRestock,
    recordSale,
    recordVoid,
    recordWriteOff,
    restockCommandSchema,
    saleCommandSchema,
    voidCommandSchema,
    writeOffCommandSchema,
} from "../../bll/index.js"
import { publicProcedure, router } from "../trpc.js"

export const transactionsRouter = router({
    /**
     * Retrieves all transaction records from the ledger log.
     */
    list: publicProcedure.query(({ ctx }) => {
        return listTransactions(ctx.db)
    }),

    /**
     * Retrieves a single transaction record by identifier.
     */
    get: publicProcedure.input(getTransactionSchema).query(({ ctx, input }) => {
        return getTransaction(ctx.db, input.id)
    }),

    /**
     * Records a single SALE transaction.
     */
    recordSale: publicProcedure.input(saleCommandSchema).mutation(({ ctx, input }) => {
        return recordSale(ctx.db, input)
    }),

    /**
     * Records a batch list of SALE transactions atomically.
     */
    recordBulkSale: publicProcedure.input(z.array(saleCommandSchema)).mutation(({ ctx, input }) => {
        return recordBulkSale(ctx.db, input)
    }),

    /**
     * Records a RESTOCK transaction.
     */
    recordRestock: publicProcedure.input(restockCommandSchema).mutation(({ ctx, input }) => {
        return recordRestock(ctx.db, input)
    }),

    /**
     * Records a WRITE_OFF transaction.
     */
    recordWriteOff: publicProcedure.input(writeOffCommandSchema).mutation(({ ctx, input }) => {
        return recordWriteOff(ctx.db, input)
    }),

    /**
     * Records a CREDIT_PAYMENT transaction linked to an outstanding sale.
     */
    recordCreditPayment: publicProcedure
        .input(creditPaymentCommandSchema)
        .mutation(({ ctx, input }) => {
            return recordCreditPayment(ctx.db, input)
        }),

    /**
     * Records a VOID transaction reversing a prior entry.
     */
    recordVoid: publicProcedure.input(voidCommandSchema).mutation(({ ctx, input }) => {
        return recordVoid(ctx.db, input)
    }),
})
