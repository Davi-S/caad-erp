/**
 * Money donations received: cash arriving with no deal behind it.
 *
 * A payment in without anything to settle. There is no agreement, so nothing was
 * promised and nothing is owed: the money simply arrives, and the only thing the
 * ledger records is that it did.
 *
 * Because it agrees nothing, a donation never shows in a total of what was
 * agreed. A report of what the shop took in has to count it as money moving,
 * alongside the payments that settle deals.
 */

import type { DB, LedgerDocument } from "../../../dal/index.js"
import { newId } from "../../../ids.js"
import { validate } from "../../validate.js"
import { documentFields, paymentsField } from "../fields.js"
import { post } from "../post.js"
import { SHAPES, type DocumentSpec } from "../shapes.js"
import { z } from "zod"

/**
 * A money donation: money in, against nothing.
 *
 * It links to no document at all, which is the whole difference from a payment
 * in: there is no deal it is fulfilling. Who gave it goes in the notes.
 */
export const moneyDonationInSpec: DocumentSpec = {
    type: "MONEY_DONATION_IN",
    shape: SHAPES.moneyIn,
    checks: [],
    contextChecks: [],
    salesman: "active",
    products: "any",
    linkedTypes: null,
}

/**
 * Input for recording money received as a donation.
 */
export const moneyDonationInSchema = z.strictObject({
    ...documentFields,
    payments: paymentsField,
})

export type MoneyDonationInCommand = z.input<typeof moneyDonationInSchema>

/**
 * Records money received as a donation.
 *
 * @param command - Raw input matching {@link moneyDonationInSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordMoneyDonationIn(db: DB, command: MoneyDonationInCommand): LedgerDocument {
    const input = validate(moneyDonationInSchema, command)

    return post(
        db,
        moneyDonationInSpec,
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
                type: "MONEY_DONATION_IN",
                occurredAt: input.occurredAt ?? recordedAt,
                recordedAt,
                performedBy: input.performedBy,
                linkedDocumentId: null,
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
