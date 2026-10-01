/**
 * Sales: goods going out, priced from the catalog and paid for at the counter.
 *
 * The payments have to cover what was agreed, so a sale is never left owing.
 * Goods sold to be paid for later are a `CREDIT_SALE`.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentDiscountField, documentFields, paymentsField, soldItemsField } from "../fields.js"
import { post } from "../post.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { movementRows, paymentRows, priceItems } from "../rows.js"
import { z } from "zod"

/**
 * A sale: goods out, money in, both now.
 */
export const saleSpec: DocumentSpec = {
    type: "SALE",
    shape: SHAPES.moneyInGoodsOut,
    checks: [],
    contextChecks: [],
    salesman: "active",
    products: "active",
    linkedTypes: null,
}

/**
 * Input for recording a sale paid at the counter.
 */
export const saleSchema = z.strictObject({
    ...documentFields,
    items: soldItemsField,
    documentDiscount: documentDiscountField,
    payments: paymentsField,
})

export type SaleCommand = z.input<typeof saleSchema>

/**
 * Records a sale paid at the counter.
 *
 * @param command - Raw input matching {@link saleSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the payments do not cover the sale, a
 * discount is larger than what is being sold, or another rule is broken.
 */
export function recordSale(db: DB, command: SaleCommand): LedgerDocument {
    const input = validate(saleSchema, command)

    return post(
        db,
        saleSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        (context) => {
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "SALE",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                agreements: priceItems(id, input.items, input.documentDiscount, context),
                movements: movementRows(id, input.items, "out"),
                payments: paymentRows(id, input.payments, "in"),
            }
        },
    )
}
