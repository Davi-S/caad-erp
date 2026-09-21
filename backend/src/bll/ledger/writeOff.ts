/**
 * Write-offs: stock that left without being sold (loss, damage, expiry, units
 * found missing).
 *
 * What the goods cost is not stored: the costing report values them from the
 * batches they came from. What is stored is anything received for them, which is
 * usually nothing, but may be a supplier taking back what spoiled, an insurer
 * paying for damage, or a customer paying for what they broke.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { validate } from "../validate.js"
import { documentFields, paymentField, productIdField, quantityField } from "./fields.js"
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
    payments: z.array(paymentField).default([]),
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
            payments: input.payments.map((payment) => ({
                id: newId(),
                documentId: id,
                linkedPaymentId: null,
                method: payment.method,
                // Money arrives: what was received for the goods
                amount: payment.amount,
            })),
        }
        return doc
    })
}
