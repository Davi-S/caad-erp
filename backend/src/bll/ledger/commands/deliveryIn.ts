/**
 * Deliveries in: goods arriving against a purchase that already paid for them.
 *
 * What a delivery out is to a pre-paid sale, a delivery in is to a pre-paid
 * restock. The document carries movements and nothing else: what was agreed and
 * what it cost stay on the purchase, so what is still to arrive is its quantity
 * less every delivery made against it.
 *
 * Like a delivery out, it is capped. Taking in more units than were bought is
 * stock appearing with nothing accounting for it, so the units are counted
 * against what the purchase agreed and what earlier deliveries already brought.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, documentIdField, movedItemsField } from "../fields.js"
import { post } from "../post.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A delivery in: goods in, no money, against a purchase already paid for.
 *
 * Only a pre-paid restock owes goods in. A restock paid at the counter took them
 * already, and a credit restock owes money rather than units.
 */
export const deliveryInSpec: DocumentSpec = {
    type: "DELIVERY_IN",
    shape: SHAPES.goodsIn,
    checks: [],
    contextChecks: ["targetNotVoided", "movementsWithinAgreed"],
    salesman: "active",
    // Goods already paid for have to be receivable, whatever the catalog says now
    products: "exists",
    linkedTypes: ["PRE_PAID_RESTOCK"],
}

/**
 * Input for recording goods received.
 */
export const deliveryInSchema = z.strictObject({
    ...documentFields,
    documentId: documentIdField,
    items: movedItemsField,
})

export type DeliveryInCommand = z.input<typeof deliveryInSchema>

/**
 * Records goods arriving against a purchase that has already been paid for.
 *
 * @param command - Raw input matching {@link deliveryInSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman, the document or a product does
 * not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document is not one that owes goods
 * in, is voided, or more units arrive than it agreed.
 */
export function recordDeliveryIn(db: DB, command: DeliveryInCommand): LedgerDocument {
    const input = validate(deliveryInSchema, command)

    return post(
        db,
        deliveryInSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: input.documentId,
        },
        () => {
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "DELIVERY_IN",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: input.documentId,
                notes: input.notes,
                agreements: [],
                movements: input.items.map((item) => ({
                    id: newId(),
                    documentId: id,
                    productId: item.productId,
                    linkedMovementId: null,
                    // Stock arrives
                    quantity: item.quantity,
                })),
                payments: [],
            }
        },
    )
}
