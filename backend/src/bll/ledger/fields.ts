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
export const paymentField = z.strictObject({
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
 * One line per product.
 *
 * Two lines for the same product is a miscount at the counter, not a quantity to
 * be added up: the caller says how many of each, once. The stored rows have the
 * same rule, so this only decides which layer gets to explain it.
 */
export function oneLinePerProduct(
    items: { productId: string }[],
    ctx: z.core.$RefinementCtx,
): void {
    const seen = new Set<string>()
    for (const [position, item] of items.entries()) {
        if (seen.has(item.productId)) {
            ctx.addIssue({
                code: "custom",
                path: [position, "productId"],
                message: "This product is already listed",
            })
        }
        seen.add(item.productId)
    }
}

/**
 * What is being sold: a product, how many, and what comes off that line.
 */
export const soldItemsField = z
    .array(
        z.strictObject({
            productId: productIdField,
            quantity: quantityField,
            lineDiscount: discountField.default(0),
        }),
    )
    .min(1, "At least one item is required")
    .superRefine(oneLinePerProduct)

/**
 * A discount over a whole cart, split across its items in proportion to what
 * they cost.
 */
export const documentDiscountField = discountField.default(0)

/**
 * What a line's units cost together, not what one of them cost.
 */
const totalCostField = z
    .int("Cost must be a whole number of cents")
    .nonnegative("Cost cannot be negative")

/**
 * What is being bought: a product, how many, and what those units cost.
 *
 * The sale side works the other way round: there the catalog says what a unit is
 * worth and the discounts come off it, while here the supplier's price is simply
 * what it is, so a purchase states the total and nothing is worked out.
 */
export const purchasedItemsField = z
    .array(
        z.strictObject({
            productId: productIdField,
            quantity: quantityField,
            totalCost: totalCostField,
        }),
    )
    .min(1, "At least one item is required")
    .superRefine(oneLinePerProduct)

/**
 * Goods that only move: a product and how many units of it.
 *
 * No money is named, because these documents settle against what a linked
 * document already agreed, or against nothing at all.
 */
export const movedItemsField = z
    .array(z.strictObject({ productId: productIdField, quantity: quantityField }))
    .min(1, "At least one item is required")
    .superRefine(oneLinePerProduct)
