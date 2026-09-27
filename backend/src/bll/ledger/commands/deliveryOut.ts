/**
 * Deliveries out: goods leaving against a sale that already paid for them.
 *
 * Named for the direction, because goods coming in against a purchase paid for
 * up front is the same document the other way round, and money has the same pair.
 *
 * What a payment in is to a credit sale, a delivery out is to a pre-paid sale. The
 * document carries movements and nothing else: what was agreed and what it was
 * worth stay on the sale, and this only records units going out, so what is still
 * to collect is the sale's quantity less every delivery out made against it.
 *
 * Unlike a payment, it is capped. Handing over more than was sold is not a tip:
 * it is stock leaving with nothing behind it, so the units are counted against
 * what the sale agreed and what earlier deliveries out already took.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, oneLinePerProduct, productIdField, quantityField } from "../fields.js"
import { post } from "../post.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A delivery out: goods out, no money, against a sale already paid for.
 *
 * Only a pre-paid sale owes goods out. A counter sale handed them over already,
 * and a credit sale owes money rather than units.
 */
export const deliveryOutSpec: DocumentSpec = {
    type: "DELIVERY_OUT",
    shape: SHAPES.goodsOut,
    checks: [],
    contextChecks: ["targetNotVoided", "movementsWithinAgreed"],
    salesman: "active",
    // Goods already paid for have to be collectable, whatever the catalog says now
    products: "exists",
    linkedTypes: ["PRE_PAID_SALE"],
}

/**
 * Input for recording goods collected.
 */
export const deliveryOutSchema = z.strictObject({
    ...documentFields,
    documentId: z.string().trim().min(1, "Document is required"),
    items: z
        .array(z.strictObject({ productId: productIdField, quantity: quantityField }))
        .min(1, "At least one item is required")
        .superRefine(oneLinePerProduct),
})

export type DeliveryOutCommand = z.input<typeof deliveryOutSchema>

/**
 * Records goods going out against a sale that has already been paid for.
 *
 * @param command - Raw input matching {@link deliveryOutSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman, the document or a product does
 * not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document is not one that owes goods
 * out, is voided, or more units are handed over than it agreed.
 */
export function recordDeliveryOut(db: DB, command: DeliveryOutCommand): LedgerDocument {
    const input = validate(deliveryOutSchema, command)

    return post(
        db,
        deliveryOutSpec,
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
                type: "DELIVERY_OUT",
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
                    // Stock leaves
                    quantity: -item.quantity,
                })),
                payments: [],
            }
        },
    )
}
