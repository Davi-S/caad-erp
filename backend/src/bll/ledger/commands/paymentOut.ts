/**
 * Money leaving against something recorded earlier: a credit restock being
 * settled, in one go or in instalments.
 *
 * What a payment in is to a credit sale, a payment out is to a credit restock.
 * The document carries payments and nothing else: what was agreed stays on the
 * restock, so what is still owed is its cost less every payment made against it.
 *
 * It is capped at what the restock still owes, counting what earlier payments
 * already settled. Money handed to a supplier on top of that is not part of
 * settling the debt: a fee or a rounding-up is an `EXPENSE`, which says so.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, paymentField } from "../fields.js"
import { post } from "../post.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * Money out against a document that owes it.
 *
 * Only a credit restock owes money out. A restock paid at the counter has
 * nothing left to pay, and money owed *to* the shop is a payment in.
 */
export const paymentOutSpec: DocumentSpec = {
    type: "PAYMENT_OUT",
    shape: SHAPES.moneyOut,
    checks: [],
    contextChecks: ["targetNotVoided", "paymentsWithinOwed"],
    salesman: "active",
    products: "any",
    linkedTypes: ["CREDIT_RESTOCK"],
}

/**
 * Input for recording money paid out.
 */
export const paymentOutSchema = z.strictObject({
    ...documentFields,
    documentId: z.string().trim().min(1, "Document is required"),
    payments: z.array(paymentField).min(1, "At least one payment is required"),
})

export type PaymentOutCommand = z.input<typeof paymentOutSchema>

/**
 * Records money paid out against a document that owes it.
 *
 * @param command - Raw input matching {@link paymentOutSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or the document does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document is not one that owes money
 * out, is voided, or another rule is broken.
 */
export function recordPaymentOut(db: DB, command: PaymentOutCommand): LedgerDocument {
    const input = validate(paymentOutSchema, command)

    return post(
        db,
        paymentOutSpec,
        {
            performedBy: input.performedBy,
            productIds: [],
            linkedDocumentId: input.documentId,
        },
        () => {
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "PAYMENT_OUT",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: input.documentId,
                notes: input.notes,
                agreements: [],
                movements: [],
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
