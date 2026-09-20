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
 * `cost` is what the line's units cost in total, not per unit, and 0 records
 * goods that came in free. The payments must add up to the total cost, so they
 * are left out only when nothing was paid.
 */
export const restockSchema = z.object({
    ...documentFields,
    items: z
        .array(
            z.object({
                productId: productIdField,
                quantity: quantityField,
                cost: z
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
 * @throws {@link RuleViolationError} If the payments do not add up to the cost,
 * or the document breaks another rule.
 */
export function recordRestock(db: DB, command: RestockCommand): LedgerDocument {
    const input = validate(restockSchema, command)

    return post(db, () => {
        const recordedAt = new Date()
        const id = newId()
        const doc: NewLedgerDocument = {
            id,
            type: "RESTOCK",
            occurredAt: input.occurredAt ?? recordedAt,
            recordedAt,
            salesmanId: input.salesmanId,
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
                itemDiscount: null,
                globalDiscount: null,
                amount: null,
                cost: item.cost,
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
