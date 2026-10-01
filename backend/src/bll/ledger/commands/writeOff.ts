/**
 * Write-offs: stock that left with nobody on the other side (loss, damage,
 * expiry, units found missing).
 *
 * Nothing is agreed, so there is no value: what the goods cost is derived from
 * the batches they came from. Goods that leave *for* something are not this.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, movedItemsField } from "../fields.js"
import { post } from "../post.js"
import { movementRows } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A write-off: goods out, nothing agreed and no money.
 */
export const writeOffSpec: DocumentSpec = {
    type: "WRITE_OFF",
    shape: SHAPES.goodsOut,
    checks: [],
    contextChecks: [],
    salesman: "active",
    // Stock of an inactive product still has to be cleared
    products: "exists",
    linkedTypes: null,
}

/**
 * Input for recording a write-off.
 */
export const writeOffSchema = z.strictObject({
    ...documentFields,
    items: movedItemsField,
})

export type WriteOffCommand = z.input<typeof writeOffSchema>

/**
 * Records a write-off.
 *
 * @param command - Raw input matching {@link writeOffSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordWriteOff(db: DB, command: WriteOffCommand): LedgerDocument {
    const input = validate(writeOffSchema, command)

    return post(
        db,
        writeOffSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        () => {
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
                agreements: [],
                movements: movementRows(id, input.items, "out"),
                payments: [],
            }
            return doc
        },
    )
}
