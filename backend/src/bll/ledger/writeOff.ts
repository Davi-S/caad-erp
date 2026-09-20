/**
 * Write-offs: stock that left without being sold (loss, damage, expiry, units
 * found missing).
 *
 * Goods only, no money: the loss is valued by the costing report, not stored.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { validate } from "../validate.js"
import { requireActiveProduct } from "../products.js"
import { requireActiveSalesman } from "../salesmen.js"
import { post } from "./post.js"
import { z } from "zod"

/**
 * Input for recording a write-off, in the caller's terms: quantities are how many
 * units left, so they are positive here and stored negative.
 *
 * `occurredAt` defaults to now; it is given when entering something that happened
 * earlier. `notes` defaults to none, like the column it is stored in.
 */
export const writeOffSchema = z.object({
    salesmanId: z.string().trim().min(1, "Salesman is required"),
    occurredAt: z.date().optional(),
    items: z
        .array(
            z.object({
                productId: z.string().trim().min(1, "Product is required"),
                quantity: z
                    .int("Quantity must be a whole number")
                    .positive("Quantity must be greater than zero"),
            }),
        )
        .min(1, "At least one item is required"),
    notes: z.string().trim().min(1, "Notes cannot be blank").nullable().default(null),
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

    return post(db, () => {
        requireActiveSalesman(db, input.salesmanId)
        for (const item of input.items) {
            requireActiveProduct(db, item.productId)
        }

        const recordedAt = new Date()
        const id = newId()
        const doc: NewLedgerDocument = {
            id,
            type: "WRITE_OFF",
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
                // Stock leaves: quantities are stored negative
                quantity: -item.quantity,
                unitPrice: null,
                itemDiscount: null,
                globalDiscount: null,
                amount: null,
                cost: null,
            })),
            payments: [],
        }
        return doc
    })
}
