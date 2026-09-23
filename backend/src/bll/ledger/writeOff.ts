/**
 * Write-offs: stock that left with nobody on the other side (loss, damage,
 * expiry, units found missing).
 *
 * No deal, so no value: what the goods cost is derived from the batches they came
 * from. Goods that leave *for* something are not this.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { validate } from "../validate.js"
import { documentFields, productIdField, quantityField } from "./fields.js"
import { post } from "./post.js"
import { z } from "zod"

/**
 * Input for recording a write-off.
 */
export const writeOffSchema = z.object({
    ...documentFields,
    items: z
        .array(z.object({ productId: productIdField, quantity: quantityField }))
        .min(1, "At least one item is required"),
})

export type WriteOffCommand = z.input<typeof writeOffSchema>

/**
 * Records a write-off.
 *
 * @param command - Raw input matching {@link writeOffSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordWriteOff(db: DB, command: WriteOffCommand): LedgerDocument {
    const input = validate(writeOffSchema, command)

    return post(
        db,
        {
            type: "WRITE_OFF",
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        () => {
            const recordedAt = new Date()
            const id = newId()

            const doc: NewLedgerDocument = {
                id,
                type: "WRITE_OFF",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                terms: [],
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
            return doc
        },
    )
}
