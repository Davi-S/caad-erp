/**
 * Restocks: goods coming in, and the money paid for them.
 *
 * A restock line's cost is the only cost ever stored. What a sale, write-off or
 * reversal cost is derived by replaying these batches in business order, oldest
 * first (FIFO), because which batch a unit came from depends on everything
 * recorded before it, and a backdated or voided restock changes that answer. A
 * cost stored at sale time would silently become wrong. See #164 and #166.
 *
 * Donations and found units cost nothing, which keeps them from diluting the
 * value of what was bought.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { validate } from "../validate.js"
import { documentFields, paymentField, productIdField, quantityField } from "./fields.js"
import { post } from "./post.js"
import { z } from "zod"

/**
 * Input for recording a restock.
 *
 * `totalCost` is what the line's units cost together, not per unit, and 0 records
 * goods that came in free. Payments are what was handed over now: none, part or
 * all of the cost. What is still owed is settled later with a `PAYMENT`, and the
 * shortfall is reported until then.
 */
export const restockSchema = z.object({
    ...documentFields,
    items: z
        .array(
            z.object({
                productId: productIdField,
                quantity: quantityField,
                totalCost: z
                    .int("Cost must be a whole number of cents")
                    .nonnegative("Cost cannot be negative"),
            }),
        )
        .min(1, "At least one item is required"),
    payments: z.array(paymentField).default([]),
})

export type RestockCommand = z.input<typeof restockSchema>

/**
 * Records a restock.
 *
 * @param command - Raw input matching {@link restockSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordRestock(db: DB, command: RestockCommand): LedgerDocument {
    const input = validate(restockSchema, command)

    const references = {
        type: "RESTOCK",
        performedBy: input.performedBy,
        productIds: input.items.map((item) => item.productId),
        linkedDocumentId: null,
    } as const

    return post(db, references, () => {
        const recordedAt = new Date()
        const id = newId()
        const doc: NewLedgerDocument = {
            id,
            type: "RESTOCK",
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
                // Stock arrives: quantities are stored positive
                quantity: item.quantity,
                unitPrice: null,
                lineDiscount: null,
                documentDiscountShare: null,
                amount: null,
                totalCost: item.totalCost,
            })),
            payments: input.payments.map((payment) => ({
                id: newId(),
                documentId: id,
                linkedPaymentId: null,
                method: payment.method,
                // Money leaves: payments for goods are stored negative
                amount: -payment.amount,
            })),
        }
        return doc
    })
}
