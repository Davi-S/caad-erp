/**
 * Goods donations received: stock arriving with no deal behind it.
 *
 * A delivery in without anything to fulfil. There is no agreement, so the units
 * come onto the shelf at no cost: nobody was paid for them and nothing is owed
 * for them.
 *
 * That is the counterpart of a write-off, which is goods leaving for nothing.
 * Both are their own kind of event precisely because a document that agrees
 * something has to be worth something.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, movedItemsField } from "../fields.js"
import { post } from "../post.js"
import { movementRows } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A goods donation: goods in, against nothing.
 *
 * It links to no document at all, which is the whole difference from a delivery
 * in: there is no purchase it is fulfilling. Who gave them goes in the notes.
 */
export const goodsDonationInSpec: DocumentSpec = {
    type: "GOODS_DONATION_IN",
    shape: SHAPES.goodsIn,
    checks: [],
    contextChecks: [],
    salesman: "active",
    // Stock of a product that is no longer sold is not taken on, gift or not
    products: "active",
    linkedTypes: null,
}

/**
 * Input for recording goods received as a donation.
 */
export const goodsDonationInSchema = z.strictObject({
    ...documentFields,
    items: movedItemsField,
})

export type GoodsDonationInCommand = z.input<typeof goodsDonationInSchema>

/**
 * Records goods received as a donation.
 *
 * @param command - Raw input matching {@link goodsDonationInSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordGoodsDonationIn(db: DB, command: GoodsDonationInCommand): LedgerDocument {
    const input = validate(goodsDonationInSchema, command)

    return post(
        db,
        goodsDonationInSpec,
        {
            performedBy: input.performedBy,
            productIds: input.items.map((item) => item.productId),
            linkedDocumentId: null,
        },
        () => {
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "GOODS_DONATION_IN",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                agreements: [],
                // Stock arrives, owing nothing
                movements: movementRows(id, input.items, "in"),
                payments: [],
            }
        },
    )
}
