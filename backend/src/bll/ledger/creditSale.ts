/**
 * Credit sales: goods going out on the same terms as a sale, with the money owed.
 *
 * The goods leave now and what they are worth is agreed now; only the payment
 * waits. The document carries no payments at all, and a later `PAYMENT_IN`
 * settles it, in one go or in instalments. Paying part at the counter is not this:
 * that is a credit sale and a payment, two documents.
 *
 * The debt is the salesman's, not a customer's: whoever performed the sale owns
 * the balance until it is paid.
 */

import type { DB, LedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { validate } from "../validate.js"
import { documentFields } from "./fields.js"
import { post } from "./post.js"
import { documentDiscountField, itemsField, priceItems } from "./pricing.js"
import { z } from "zod"

/**
 * Input for recording a sale to be paid later.
 */
export const creditSaleSchema = z.object({
    ...documentFields,
    items: itemsField,
    documentDiscount: documentDiscountField,
})

export type CreditSaleCommand = z.input<typeof creditSaleSchema>

/**
 * Records a sale to be paid later.
 *
 * @param command - Raw input matching {@link creditSaleSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If a discount is larger than what is being
 * sold, or another rule is broken.
 */
export function recordCreditSale(db: DB, command: CreditSaleCommand): LedgerDocument {
    const input = validate(creditSaleSchema, command)

    return post(
        db,
        {
            type: "CREDIT_SALE",
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        (context) => {
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "CREDIT_SALE",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                ...priceItems(id, input.items, input.documentDiscount, context),
                payments: [],
            }
        },
    )
}
