/**
 * Money arriving against something recorded earlier: a credit sale being settled,
 * in one go or in instalments.
 *
 * The document carries payments and nothing else. What was agreed stays on the
 * credit sale; this only records money moving, so what is still owed is the sale's
 * value less every payment made against it.
 *
 * It is capped at what the sale still owes, counting what earlier payments
 * already settled. Money handed over on top of that is a `MONEY_DONATION_IN`.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, documentIdField, paymentsField } from "../fields.js"
import { post } from "../post.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * Money in against a document that is owed.
 *
 * Only a credit sale owes money in. A sale settled at the counter has nothing
 * left to pay, and money owed *by* the shop is a payment out, which is a type of
 * its own.
 */
export const paymentInSpec: DocumentSpec = {
    type: "PAYMENT_IN",
    shape: SHAPES.moneyIn,
    checks: [],
    contextChecks: ["targetNotVoided", "paymentsWithinOwed"],
    salesman: "active",
    products: "any",
    linkedTypes: ["CREDIT_SALE"],
}

/**
 * Input for recording money received.
 */
export const paymentInSchema = z.strictObject({
    ...documentFields,
    documentId: documentIdField,
    payments: paymentsField,
})

export type PaymentInCommand = z.input<typeof paymentInSchema>

/**
 * Records money received against a document that is owed.
 *
 * @param command - Raw input matching {@link paymentInSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or the document does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document is not one that owes money
 * in, is voided, or another rule is broken.
 */
export function recordPaymentIn(db: DB, command: PaymentInCommand): LedgerDocument {
    const input = validate(paymentInSchema, command)

    return post(
        db,
        paymentInSpec,
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
                type: "PAYMENT_IN",
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
                    // Money arrives
                    amount: payment.amount,
                })),
            }
        },
    )
}
