/**
 * Zod validation schemas and command payload types for salesmen and transactions.
 *
 * Defines runtime input validation schemas for salesman and transaction commands,
 * attaching explicit domain exception classes via Zod `params.errorClass` metadata.
 */

import { z } from "zod"
import { paymentTypeValues } from "../dal/index.js"
import { InvalidAttributeError, InvalidMonetaryValueError, InvalidQuantityError } from "./errors.js"

export { validateSchema } from "./validator.js"

/**
 * Zod schema for adding a new salesman.
 */
export const addSalesmanSchema = z.object({
    salesmanId: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    salesmanName: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman name must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    isActive: z.boolean(),
})

/**
 * Command payload for registering a new salesman.
 */
export type AddSalesmanCommand = z.infer<typeof addSalesmanSchema>

/**
 * Zod schema for updating an existing salesman.
 */
export const updateSalesmanSchema = z.object({
    salesmanName: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman name must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>)
        .optional(),
    isActive: z.boolean().optional(),
})

/**
 * Command payload for updating selected fields of a salesman.
 */
export type UpdateSalesmanCommand = z.infer<typeof updateSalesmanSchema>

/**
 * Zod schema for recording a sale transaction.
 */
export const saleCommandSchema = z.object({
    productId: z
        .string()
        .trim()
        .min(1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    salesmanId: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    quantity: z
        .number()
        .int({
            message: "Quantity must be an integer",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>)
        .positive({
            message: "Quantity must be greater than zero",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>),
    totalRevenue: z
        .number()
        .int({
            message: "Amount must be an integer",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>)
        .min(0, {
            message: "Amount must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>),
    paymentType: z.enum(paymentTypeValues),
    notes: z.string().nullable().optional(),
})

/**
 * Command payload for recording a sale transaction.
 */
export type SaleCommand = z.infer<typeof saleCommandSchema>

/**
 * Zod schema for recording a restock transaction.
 */
export const restockCommandSchema = z.object({
    productId: z
        .string()
        .trim()
        .min(1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    salesmanId: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    quantity: z
        .number()
        .int({
            message: "Quantity must be an integer",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>)
        .positive({
            message: "Quantity must be greater than zero",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>),
    totalCost: z
        .number()
        .int({
            message: "Amount must be an integer",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>)
        .min(0, {
            message: "Amount must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>),
    notes: z.string().nullable().optional(),
})

/**
 * Command payload for recording a restock transaction.
 */
export type RestockCommand = z.infer<typeof restockCommandSchema>

/**
 * Zod schema for recording a write-off transaction.
 */
export const writeOffCommandSchema = z.object({
    productId: z
        .string()
        .trim()
        .min(1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    salesmanId: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    quantity: z
        .number()
        .int({
            message: "Quantity must be an integer",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>)
        .positive({
            message: "Quantity must be greater than zero",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>),
    notes: z.string().nullable().optional(),
})

/**
 * Command payload for recording a write-off transaction.
 */
export type WriteOffCommand = z.infer<typeof writeOffCommandSchema>

/**
 * Zod schema for recording a credit payment.
 */
export const creditPaymentCommandSchema = z.object({
    linkedTransactionId: z
        .string()
        .trim()
        .min(1, {
            message: "Transaction ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    salesmanId: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    totalRevenue: z
        .number()
        .int({
            message: "Payment amount must be an integer",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>)
        .positive({
            message: "Payment amount must be greater than zero",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>),
    paymentType: z.enum(paymentTypeValues),
    notes: z.string().nullable().optional(),
})

/**
 * Command payload for recording a credit payment.
 */
export type CreditPaymentCommand = z.infer<typeof creditPaymentCommandSchema>

/**
 * Zod schema for recording an opening stock entry.
 */
export const openStockCommandSchema = z.object({
    productId: z
        .string()
        .trim()
        .min(1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    salesmanId: z
        .string()
        .trim()
        .min(1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    quantity: z
        .number()
        .int({
            message: "Quantity must be an integer",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>)
        .positive({
            message: "Quantity must be greater than zero",
            params: { errorClass: InvalidQuantityError },
        } as Record<string, unknown>),
    totalRevenue: z
        .number()
        .int({
            message: "Amount must be an integer",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>)
        .min(0, {
            message: "Amount must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>),
})

/**
 * Command payload for recording an opening stock entry.
 */
export type OpenStockCommand = z.infer<typeof openStockCommandSchema>

/**
 * Zod schema for voiding a transaction.
 */
export const voidCommandSchema = z.object({
    linkedTransactionId: z
        .string()
        .trim()
        .min(1, {
            message: "Transaction ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    notes: z.string().nullable().optional(),
})

/**
 * Command payload for voiding a transaction.
 */
export type VoidCommand = z.infer<typeof voidCommandSchema>
