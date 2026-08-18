/**
 * tRPC initialization, middleware configuration, and procedure primitives.
 */

import { TRPCError, initTRPC } from "@trpc/server"
import {
    BusinessRuleViolationError,
    DuplicateProductError,
    DuplicateSalesmanError,
    ProductNotFoundError,
    SalesmanNotFoundError,
    TransactionNotFoundError,
} from "../bll/index.js"
import type { Context } from "./context.js"

const t = initTRPC.context<Context>().create()

/**
 * Middleware translating custom BLL domain exception classes into standard {@link TRPCError} status codes.
 */
const domainErrorTranslator = t.middleware(async ({ next }) => {
    try {
        return await next()
    } catch (cause) {
        if (
            cause instanceof ProductNotFoundError ||
            cause instanceof SalesmanNotFoundError ||
            cause instanceof TransactionNotFoundError
        ) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: cause.message,
                cause,
            })
        }

        if (cause instanceof DuplicateProductError || cause instanceof DuplicateSalesmanError) {
            throw new TRPCError({
                code: "CONFLICT",
                message: cause.message,
                cause,
            })
        }

        if (cause instanceof BusinessRuleViolationError) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: cause.message,
                cause,
            })
        }

        throw cause
    }
})

/**
 * Primary tRPC router factory export.
 */
export const router = t.router

/**
 * Public procedure builder auto-equipped with domain exception status translation middleware.
 */
export const publicProcedure = t.procedure.use(domainErrorTranslator)

/**
 * Middleware builder export.
 */
export const middleware = t.middleware

/**
 * Server-side and integration test caller factory export.
 */
export const createCallerFactory = t.createCallerFactory
