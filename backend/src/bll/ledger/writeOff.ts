/**
 * Write-offs: stock that left without being sold (loss, damage, expiry, units
 * found missing).
 *
 * Goods only, no money: the loss is valued by the costing report, not stored.
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
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordWriteOff(db: DB, command: WriteOffCommand): LedgerDocument {
    const input = validate(writeOffSchema, command)

    const references = {
        type: "WRITE_OFF",
        performedBy: input.performedBy,
        productIds: input.items.map((item) => item.productId),
        linkedDocumentId: null,
    } as const

    return post(db, references, () => {
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
            lines: input.items.map((item) => ({
                id: newId(),
                documentId: id,
                productId: item.productId,
                linkedLineId: null,
                // Stock leaves: quantities are stored negative
                quantity: -item.quantity,
                unitPrice: null,
                lineDiscount: null,
                documentDiscountShare: null,
                amount: null,
                totalCost: null,
            })),
            payments: [],
        }
        return doc
    })
}
