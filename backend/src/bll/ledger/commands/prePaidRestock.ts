/**
 * Pre-paid restocks: goods paid for now and collected from the supplier later.
 *
 * The mirror of a pre-paid sale. There, the customer pays up front and the goods
 * are owed to them; here, the shop pays a supplier up front and the goods are
 * owed to the shop. The money leaves at once and the units arrive on one or more
 * `DELIVERY_IN` documents, so stock only rises when the goods actually turn up.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, paymentsField, purchasedItemsField } from "../fields.js"
import { post } from "../post.js"
import { costItems, paymentRows } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A pre-paid restock: money out now, goods deferred.
 *
 * It carries no movements at all. Goods paid for now and moved later is what a
 * deferred shape says, and a delivery in is what says they arrived.
 */
export const prePaidRestockSpec: DocumentSpec = {
    type: "PRE_PAID_RESTOCK",
    shape: SHAPES.moneyOutGoodsDeferred,
    checks: [],
    contextChecks: [],
    salesman: "active",
    products: "active",
    linkedTypes: null,
}

/**
 * Input for recording goods paid for up front.
 */
export const prePaidRestockSchema = z.strictObject({
    ...documentFields,
    items: purchasedItemsField,
    payments: paymentsField,
})

export type PrePaidRestockCommand = z.input<typeof prePaidRestockSchema>

/**
 * Records goods paid for up front, with the units still to arrive.
 *
 * @param command - Raw input matching {@link prePaidRestockSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the payments do not cover the cost, the
 * goods cost nothing at all, or another rule is broken.
 */
export function recordPrePaidRestock(db: DB, command: PrePaidRestockCommand): LedgerDocument {
    const input = validate(prePaidRestockSchema, command)

    return post(
        db,
        prePaidRestockSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        () => {
            const recordedAt = new Date()
            const id = newId()
            // Costed exactly as a restock is; the goods come with the delivery in
            // instead
            const agreements = costItems(id, input.items)

            return {
                id,
                type: "PRE_PAID_RESTOCK",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                agreements,
                movements: [],
                payments: paymentRows(id, input.payments, "out"),
            }
        },
    )
}
