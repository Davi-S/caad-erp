/**
 * Voids: an entry that should never have been made.
 *
 * A void says the whole document did not happen, as opposed to a return, which is
 * a real event with its own date and may cover only part of a sale. Correcting
 * one detail therefore means voiding the document and recording it again with the
 * right values and the original's `occurred_at`.
 *
 * A void cannot be voided: to undo one, record the original again.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { validate } from "../validate.js"
import type { DocumentReferences } from "./context.js"
import { documentFields } from "./fields.js"
import { post } from "./post.js"
import { z } from "zod"

/**
 * Input for voiding a document.
 *
 * `occurredAt` is not accepted: a correction is made now, and what it takes back
 * keeps the original's own date.
 */
export const voidSchema = z.object({
    performedBy: documentFields.performedBy,
    notes: documentFields.notes,
    documentId: z.string().trim().min(1, "Document is required"),
})

export type VoidCommand = z.input<typeof voidSchema>

/**
 * Voids a document.
 *
 * @param command - Raw input matching {@link voidSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or the document does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document is already voided, has a
 * live return or payment on it, or another rule is broken.
 */
export function recordVoid(db: DB, command: VoidCommand): LedgerDocument {
    const input = validate(voidSchema, command)

    const references: DocumentReferences = {
        type: "VOID",
        performedBy: input.performedBy,
        productIds: [],
        linkedDocumentId: input.documentId,
    }

    return post(db, references, (context) => {
        const target = context.linked.getDocument(input.documentId)!
        const recordedAt = new Date()
        const id = newId()

        const doc: NewLedgerDocument = {
            id,
            type: "VOID",
            occurredAt: recordedAt,
            recordedAt,
            performedBy: input.performedBy,
            linkedDocumentId: target.id,
            notes: input.notes,
            // Every row of the target, negated: prices, discounts and costs stay
            // on the rows being taken back
            lines: target.lines.map((line) => ({
                id: newId(),
                documentId: id,
                productId: line.productId,
                linkedLineId: line.id,
                quantity: -line.quantity,
                unitPrice: null,
                lineDiscount: null,
                documentDiscountShare: null,
                amount: line.amount === null ? null : -line.amount,
                totalCost: null,
            })),
            payments: target.payments.map((payment) => ({
                id: newId(),
                documentId: id,
                linkedPaymentId: payment.id,
                method: payment.method,
                amount: -payment.amount,
            })),
        }
        return doc
    })
}
