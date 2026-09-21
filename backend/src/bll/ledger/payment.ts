/**
 * Payments: money handed over after the fact, against something already recorded.
 *
 * A sale paid off later (the salesman's tab), a supplier paid after delivery, a
 * refund given the day after a return. The money moves the same way the document
 * it settles moves it, so the direction is never given: it is read from the
 * target.
 *
 * Nothing is capped. Paying more than is owed leaves the target overpaid, which
 * the balance reports show as credit, the same way a tip on a sale does.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { validate } from "../validate.js"
import type { DocumentReferences } from "./context.js"
import { documentFields, paymentField } from "./fields.js"
import { post } from "./post.js"
import { paymentDirection } from "./rules.js"
import { z } from "zod"

/**
 * Input for recording a payment.
 *
 * Amounts are how much money changed hands, so they are positive here and given
 * their direction when the document is built.
 */
export const paymentSchema = z.object({
    ...documentFields,
    documentId: z.string().trim().min(1, "Document is required"),
    payments: z.array(paymentField).min(1, "At least one payment is required"),
})

export type PaymentCommand = z.input<typeof paymentSchema>

/**
 * Records a payment against a sale, a restock or a return.
 *
 * @param command - Raw input matching {@link paymentSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or the document does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document takes no payments, is
 * voided, or another rule is broken.
 */
export function recordPayment(db: DB, command: PaymentCommand): LedgerDocument {
    const input = validate(paymentSchema, command)

    const references: DocumentReferences = {
        type: "PAYMENT",
        performedBy: input.performedBy,
        productIds: [],
        linkedDocumentId: input.documentId,
    }

    return post(db, references, (context) => {
        const target = context.linked.getDocument(input.documentId)!
        // Money moves the way the document being settled moves it
        const direction = paymentDirection(target.type)
        const recordedAt = new Date()
        const id = newId()

        const doc: NewLedgerDocument = {
            id,
            type: "PAYMENT",
            occurredAt: input.occurredAt ?? recordedAt,
            recordedAt,
            performedBy: input.performedBy,
            linkedDocumentId: target.id,
            notes: input.notes,
            lines: [],
            payments: input.payments.map((payment) => ({
                id: newId(),
                documentId: id,
                linkedPaymentId: null,
                method: payment.method,
                amount: direction * payment.amount,
            })),
        }
        return doc
    })
}
