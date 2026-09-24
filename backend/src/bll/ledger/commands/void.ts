/**
 * Voids: an entry that should never have been made.
 *
 * A void says the whole document did not happen, so it takes back every row of
 * it: what was agreed, what moved and what was paid. Correcting one detail means
 * voiding the document and recording it again with the right values and the
 * original's `occurred_at`.
 *
 * A void cannot be voided: to undo one, record the original again.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields } from "../fields.js"
import { post } from "../post.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A void: whatever its target carries, negated.
 *
 * `products: "any"` because a void names no products of its own - every product
 * on it comes from a row that is already stored, which storage guarantees exists.
 * Checking them would repeat the foreign key, and requiring them to be active
 * would stop a discontinued product's entries from ever being corrected.
 */
export const voidSpec: DocumentSpec = {
    type: "VOID",
    shape: SHAPES.mirrored,
    checks: ["occursWhenRecorded"],
    contextChecks: ["targetIsVoidable", "targetFullyMirrored"],
    salesman: "active",
    products: "any",
    // Anything but another void: an unwanted void is undone by recording the
    // original again
    linkedTypes: ["SALE", "CREDIT_SALE", "RESTOCK", "WRITE_OFF", "PAYMENT_IN"],
}

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
 * @throws {@link RuleViolationError} If the document is a void, is already
 * voided, has something live on it, or another rule is broken.
 */
export function recordVoid(db: DB, command: VoidCommand): LedgerDocument {
    const input = validate(voidSchema, command)

    return post(
        db,
        voidSpec,
        {
            performedBy: input.performedBy,
            productIds: [],
            linkedDocumentId: input.documentId,
        },
        (context) => {
            const target = context.linked.getDocument(input.documentId)!
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "VOID",
                occurredAt: recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: target.id,
                notes: input.notes,
                // Every row of the target, negated. Prices and discounts stay on
                // the rows being taken back: the void only reverses the numbers
                // that count.
                agreements: target.agreements.map((row) => ({
                    id: newId(),
                    documentId: id,
                    productId: row.productId,
                    linkedAgreementId: row.id,
                    quantity: -row.quantity,
                    unitPrice: null,
                    lineDiscount: null,
                    documentDiscountShare: null,
                    value: -row.value,
                })),
                movements: target.movements.map((row) => ({
                    id: newId(),
                    documentId: id,
                    productId: row.productId,
                    linkedMovementId: row.id,
                    quantity: -row.quantity,
                })),
                payments: target.payments.map((payment) => ({
                    id: newId(),
                    documentId: id,
                    linkedPaymentId: payment.id,
                    method: payment.method,
                    amount: -payment.amount,
                })),
            }
        },
    )
}
