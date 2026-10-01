/**
 * Pre-paid sales: goods paid for now and collected later.
 *
 * The mirror of a credit sale. There, the goods go out and the money is owed;
 * here, the money comes in and the goods are owed. What was agreed is priced and
 * settled at once, and the units leave on one or more `DELIVERY_OUT` documents, so
 * stock only falls when the goods actually go.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentDiscountField, documentFields, paymentsField, soldItemsField } from "../fields.js"
import { post } from "../post.js"
import { paymentRows, priceItems } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A pre-paid sale: money in now, goods deferred.
 *
 * It carries no movements at all. Goods agreed now and moved later is exactly
 * what a deferred shape says, and a delivery out is what says they moved.
 */
export const prePaidSaleSpec: DocumentSpec = {
    type: "PRE_PAID_SALE",
    shape: SHAPES.moneyInGoodsDeferred,
    checks: [],
    contextChecks: [],
    salesman: "active",
    products: "active",
    linkedTypes: null,
}

/**
 * Input for recording a sale paid for up front.
 */
export const prePaidSaleSchema = z.strictObject({
    ...documentFields,
    items: soldItemsField,
    documentDiscount: documentDiscountField,
    payments: paymentsField,
})

export type PrePaidSaleCommand = z.input<typeof prePaidSaleSchema>

/**
 * Records a sale paid for up front, with the goods still to be collected.
 *
 * @param command - Raw input matching {@link prePaidSaleSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the payments do not cover the sale, a
 * discount is larger than what is being sold, or another rule is broken.
 */
export function recordPrePaidSale(db: DB, command: PrePaidSaleCommand): LedgerDocument {
    const input = validate(prePaidSaleSchema, command)

    return post(
        db,
        prePaidSaleSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        (context) => {
            const recordedAt = new Date()
            const id = newId()
            // Priced exactly as a counter sale is; the goods come with the
            // delivery out instead
            const agreements = priceItems(id, input.items, input.documentDiscount, context)

            return {
                id,
                type: "PRE_PAID_SALE",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                agreements,
                movements: [],
                payments: paymentRows(id, input.payments, "in"),
            }
        },
    )
}
