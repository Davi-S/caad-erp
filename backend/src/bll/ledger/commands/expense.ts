/**
 * Expenses: money leaving with no deal behind it.
 *
 * The write-off of the money side. A write-off is goods lost with nobody on the
 * other side of them; an expense is money spent the same way - rent, a repair, a
 * bill - with nothing bought for stock and nothing owed to anyone afterwards.
 *
 * Money paid against something the shop took on is a `PAYMENT_OUT`, which links
 * to what it settles. An expense settles nothing, so it links to nothing, and
 * what it was for goes in the notes.
 *
 * Because it agrees nothing, an expense never shows in a total of what was
 * agreed. A report of what the shop spent has to count it as money moving,
 * alongside the payments that settle purchases.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, paymentsField } from "../fields.js"
import { post } from "../post.js"
import { paymentRows } from "../rows.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * An expense: money out, against nothing.
 */
export const expenseSpec: DocumentSpec = {
    type: "EXPENSE",
    shape: SHAPES.moneyOut,
    checks: [],
    contextChecks: [],
    salesman: "active",
    products: "any",
    linkedTypes: null,
}

/**
 * Input for recording money spent.
 */
export const expenseSchema = z.strictObject({
    ...documentFields,
    payments: paymentsField,
})

export type ExpenseCommand = z.input<typeof expenseSchema>

/**
 * Records money spent on something that is not stock.
 *
 * @param command - Raw input matching {@link expenseSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordExpense(db: DB, command: ExpenseCommand): LedgerDocument {
    const input = validate(expenseSchema, command)

    return post(
        db,
        expenseSpec,
        {
            performedBy: input.performedBy,
            productIds: [],
            linkedDocumentId: null,
        },
        () => {
            const recordedAt = new Date()
            const id = newId()

            return {
                id,
                type: "EXPENSE",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
                notes: input.notes,
                agreements: [],
                movements: [],
                payments: paymentRows(id, input.payments, "out"),
            }
        },
    )
}
