/**
 * Returns: goods a customer brings back, refunded at the counter.
 *
 * A partial reversal: every row points at the row of the sale it takes back, and
 * carries that row's share of what was agreed - the price it was sold at, the
 * discounts that came off it, and what it was worth - so a customer never gets
 * back more than they paid for a discounted item, and a total of discounts given
 * across the ledger falls when goods come back.
 *
 * It shares the `mirrored` shape with a void for that reason. A void takes back a
 * whole document and its amounts are the exact negation; a return takes back part
 * of one, so its amounts are a share.
 *
 * Partial is the normal case - a customer really does bring back 2 of 10 - and a
 * sale can be returned against more than once, up to what it sold.
 *
 * A return is not a correction. An entry that should never have been made is a
 * `VOID`, which takes back the whole document; a return records that something
 * changed in the real world, and stands as its own event.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, movedItemsField, paymentField } from "../fields.js"
import { post } from "../post.js"
import { refundItems } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A return: goods in, money out, both now.
 *
 * Only a sale can be returned against.
 * A credit sale and a pre-paid sale are valid situations, but they are not
 * covered by this return. A credit sale may not be yet fully paid for, and a
 * pre-paid sale's goods left on a delivery, not on the sale itself. Both are
 * real cases, but should be handled separately.
 */
export const returnSpec: DocumentSpec = {
    type: "RETURN",
    shape: SHAPES.mirrored,
    // What moneyOutGoodsIn have
    checks: ["agreementsHaveValue", "movementsMatchAgreements", "paymentsSettleInFull"],
    contextChecks: ["targetNotVoided", "returnsWithinSold"],
    salesman: "active",
    // Goods already sold have to be returnable, whatever the catalog says now
    products: "exists",
    linkedTypes: ["SALE"],
}

/**
 * Input for recording goods brought back.
 *
 * No amount is given: what a line is worth coming back is read from the sale it
 * is coming back to.
 */
export const returnSchema = z.strictObject({
    ...documentFields,
    documentId: z.string().trim().min(1, "Document is required"),
    items: movedItemsField,
    payments: z.array(paymentField).min(1, "At least one payment is required"),
})

export type ReturnCommand = z.input<typeof returnSchema>

/**
 * Records goods brought back and refunded.
 *
 * @param command - Raw input matching {@link returnSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman, the document or a product does
 * not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document is not a sale, is voided,
 * never sold what is coming back, or more comes back than went out.
 */
export function recordReturn(db: DB, command: ReturnCommand): LedgerDocument {
    const input = validate(returnSchema, command)

    return post(
        db,
        returnSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: input.documentId,
        },
        (context) => {
            const target = context.linked.getDocument(input.documentId)!
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "RETURN",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: input.documentId,
                notes: input.notes,
                ...refundItems(id, input.items, target, context.linked.descendants(target.id)),
                payments: input.payments.map((payment) => ({
                    id: newId(),
                    documentId: id,
                    linkedPaymentId: null,
                    method: payment.method,
                    // Money leaves
                    amount: -payment.amount,
                })),
            }
        },
    )
}
