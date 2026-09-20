/**
 * Input pieces every ledger command shares.
 *
 * All of it is in the caller's terms: amounts are how much money moved, so they
 * are positive here and given their sign when the document is built.
 */

import { paymentMethodValues } from "../../dal/index.js"
import { z } from "zod"

/**
 * What every document carries: who performed it, when it happened, and notes.
 *
 * `occurredAt` defaults to now; it is given when entering something that happened
 * earlier. `notes` defaults to none, like the column it is stored in.
 */
export const documentFields = {
    salesmanId: z.string().trim().min(1, "Salesman is required"),
    occurredAt: z.date().optional(),
    notes: z.string().trim().min(1, "Notes cannot be blank").nullable().default(null),
}

/**
 * One movement of money: how it was paid, and how much.
 */
export const paymentField = z.object({
    method: z.enum(paymentMethodValues),
    amount: z
        .int("Amount must be a whole number of cents")
        .positive("Amount must be greater than zero"),
})

/**
 * A quantity of units, as the caller counts them.
 */
export const quantityField = z
    .int("Quantity must be a whole number")
    .positive("Quantity must be greater than zero")

/**
 * A product a line moves.
 */
export const productIdField = z.string().trim().min(1, "Product is required")
