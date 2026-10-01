/**
 * Restocks: goods coming in, paid for at the counter.
 *
 * `totalCost` is what the line's units cost together, not per unit. The payments
 * have to cover it, so goods that arrived for nothing are not a restock. The
 * purchase cost is the only cost ever stored; what sales and losses cost is
 * worked out from it.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, paymentsField, purchasedItemsField } from "../fields.js"
import { post } from "../post.js"
import { costItems } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A restock: goods in, money out, both now.
 */
export const restockSpec: DocumentSpec = {
    type: "RESTOCK",
    shape: SHAPES.moneyOutGoodsIn,
    checks: [],
    contextChecks: [],
    salesman: "active",
    products: "active",
    linkedTypes: null,
}

/**
 * Input for recording a restock.
 */
export const restockSchema = z.strictObject({
    ...documentFields,
    items: purchasedItemsField,
    payments: paymentsField,
})

export type RestockCommand = z.input<typeof restockSchema>

/**
 * Records a restock.
 *
 * @param command - Raw input matching {@link restockSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the payments do not cover the cost, or
 * the document breaks another rule.
 */
export function recordRestock(db: DB, command: RestockCommand): LedgerDocument {
    const input = validate(restockSchema, command)

    return post(
        db,
        restockSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        () => {
            const recordedAt = new Date()
            const id = newId()

            const doc: NewLedgerDocument = {
                id,
                type: "RESTOCK",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                ...costItems(id, input.items),
                payments: input.payments.map((payment) => ({
                    id: newId(),
                    documentId: id,
                    linkedPaymentId: null,
                    method: payment.method,
                    amount: -payment.amount,
                })),
            }
            return doc
        },
    )
}
