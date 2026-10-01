/**
 * Credit restocks: goods arriving now, to be paid for later.
 *
 * The mirror of a credit sale. There, the goods go out and the money is owed to
 * us; here, the goods come in and the money is owed by us. Stock rises at once
 * and the debt is settled by one or more `PAYMENT_OUT` documents.
 *
 * `totalCost` is what the line's units cost together, not per unit, exactly as on
 * a restock paid at the counter.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, purchasedItemsField } from "../fields.js"
import { post } from "../post.js"
import { movementRows, purchasedAgreementRows } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A credit restock: goods in now, money deferred.
 *
 * It carries no payments at all. Goods taken now and paid for later is what a
 * deferred shape says, and a payment out is what says the money moved.
 */
export const creditRestockSpec: DocumentSpec = {
    type: "CREDIT_RESTOCK",
    shape: SHAPES.moneyDeferredGoodsIn,
    checks: [],
    contextChecks: [],
    salesman: "active",
    products: "active",
    linkedTypes: null,
}

/**
 * Input for recording goods taken on credit.
 */
export const creditRestockSchema = z.strictObject({
    ...documentFields,
    items: purchasedItemsField,
})

export type CreditRestockCommand = z.input<typeof creditRestockSchema>

/**
 * Records goods taken on credit.
 *
 * @param command - Raw input matching {@link creditRestockSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the goods arrived for nothing, or the
 * document breaks another rule.
 */
export function recordCreditRestock(db: DB, command: CreditRestockCommand): LedgerDocument {
    const input = validate(creditRestockSchema, command)

    return post(
        db,
        creditRestockSpec,
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
                type: "CREDIT_RESTOCK",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                agreements: purchasedAgreementRows(id, input.items),
                movements: movementRows(id, input.items, "in"),
                payments: [],
            }
            return doc
        },
    )
}
