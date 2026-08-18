/**
 * Zod validation schemas and command payload types for salesmen and transactions.
 *
 * Defines runtime input validation schemas for salesman and transaction commands,
 * re-exporting validator helpers from validator.ts.
 */

import { z } from "zod"
import { paymentTypeValues } from "../dal/index.js"

export { validateSchema } from "./validator.js"

/**
 * Zod schema for adding a new salesman.
 */
export const addSalesmanSchema = z.object({
    salesmanId: z.string().trim().min(1, "Salesman ID must be provided"),
    salesmanName: z.string().trim().min(1, "Salesman name must be provided"),
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
    salesmanName: z.string().trim().min(1, "Salesman name must be provided").optional(),
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
    productId: z.string().trim().min(1, "Product ID must be provided"),
    salesmanId: z.string().trim().min(1, "Salesman ID must be provided"),
    quantity: z.number().int().positive("Quantity must be greater than zero"),
    totalRevenue: z.number().int().min(0, "Amount must be zero or positive"),
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
    productId: z.string().trim().min(1, "Product ID must be provided"),
    salesmanId: z.string().trim().min(1, "Salesman ID must be provided"),
    quantity: z.number().int().positive("Quantity must be greater than zero"),
    totalCost: z.number().int().min(0, "Amount must be zero or positive"),
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
    productId: z.string().trim().min(1, "Product ID must be provided"),
    salesmanId: z.string().trim().min(1, "Salesman ID must be provided"),
    quantity: z.number().int().positive("Quantity must be greater than zero"),
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
    linkedTransactionId: z.string().trim().min(1, "Transaction ID must be provided"),
    salesmanId: z.string().trim().min(1, "Salesman ID must be provided"),
    totalRevenue: z.number().int().positive("Payment amount must be greater than zero"),
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
    productId: z.string().trim().min(1, "Product ID must be provided"),
    salesmanId: z.string().trim().min(1, "Salesman ID must be provided"),
    quantity: z.number().int().positive("Quantity must be greater than zero"),
    totalRevenue: z.number().int().min(0, "Amount must be zero or positive"),
})

/**
 * Command payload for recording an opening stock entry.
 */
export type OpenStockCommand = z.infer<typeof openStockCommandSchema>

/**
 * Zod schema for voiding a transaction.
 */
export const voidCommandSchema = z.object({
    linkedTransactionId: z.string().trim().min(1, "Transaction ID must be provided"),
    notes: z.string().nullable().optional(),
})

/**
 * Command payload for voiding a transaction.
 */
export type VoidCommand = z.infer<typeof voidCommandSchema>
