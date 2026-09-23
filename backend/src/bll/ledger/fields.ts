/**
 * Input pieces every ledger command shares.
 *
 * All of it is in the caller's terms: quantities are how many units changed
 * hands and amounts are how much money did, so both are positive here and are
 * given their direction when the document is built.
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
    performedBy: z.string().trim().min(1, "Salesman is required"),
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
 * A product a row names.
 */
export const productIdField = z.string().trim().min(1, "Product is required")

/**
 * A discount, as a whole number of cents off.
 */
const discountField = z
    .int("Discount must be a whole number of cents")
    .nonnegative("Discount cannot be negative")

/**
 * What is being sold: a product, how many, and what comes off that line.
 */
export const soldItemsField = z
    .array(
        z.object({
            productId: productIdField,
            quantity: quantityField,
            lineDiscount: discountField.default(0),
        }),
    )
    .min(1, "At least one item is required")

/**
 * A discount over a whole cart, split across its items in proportion to what
 * they cost.
 */
export const documentDiscountField = discountField.default(0)
