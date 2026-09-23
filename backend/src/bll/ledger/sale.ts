/**
 * Sales: goods going out, priced from the catalog.
 *
 * A `SALE` is settled at the counter; a `CREDIT_SALE` is the same agreement with the
 * money owed, so it carries no payments and is settled later by a `PAYMENT_IN`.
 * Paying part of it now is a credit sale and a payment, two documents.
 *
 * Prices come from the catalog, never from the caller: the agreement stores the
 * catalog price of the moment, the discounts given and the net value, so a later
 * price change cannot alter what was sold.
 */

import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { distribute } from "../money.js"
import { validate } from "../validate.js"
import type { DocumentReferences, LedgerContext } from "./context.js"
import { documentFields, paymentField, productIdField, quantityField } from "./fields.js"
import { post } from "./post.js"
import { z } from "zod"

const items = z
    .array(
        z.object({
            productId: productIdField,
            quantity: quantityField,
            lineDiscount: z
                .int("Discount must be a whole number of cents")
                .nonnegative("Discount cannot be negative")
                .default(0),
        }),
    )
    .min(1, "At least one item is required")

const documentDiscount = z
    .int("Discount must be a whole number of cents")
    .nonnegative("Discount cannot be negative")
    .default(0)

/**
 * Input for recording a sale paid at the counter.
 *
 * `lineDiscount` comes off that line. `documentDiscount` comes off the whole
 * sale and is split across the lines in proportion to what they cost.
 */
export const saleSchema = z.object({
    ...documentFields,
    items,
    documentDiscount,
    payments: z.array(paymentField).min(1, "At least one payment is required"),
})

/**
 * Input for recording a sale to be paid later.
 */
export const creditSaleSchema = z.object({ ...documentFields, items, documentDiscount })

export type SaleCommand = z.input<typeof saleSchema>
export type CreditSaleCommand = z.input<typeof creditSaleSchema>

/**
 * Records a sale paid at the counter.
 *
 * @param command - Raw input matching {@link saleSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the payments do not cover the sale, a
 * discount is larger than what is being sold, or another rule is broken.
 */
export function recordSale(db: DB, command: SaleCommand): LedgerDocument {
    const input = validate(saleSchema, command)
    return post(db, references("SALE", input), (context) =>
        build("SALE", input, context, input.payments),
    )
}

/**
 * Records a sale to be paid later.
 *
 * @param command - Raw input matching {@link creditSaleSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function recordCreditSale(db: DB, command: CreditSaleCommand): LedgerDocument {
    const input = validate(creditSaleSchema, command)
    return post(db, references("CREDIT_SALE", input), (context) =>
        build("CREDIT_SALE", input, context, []),
    )
}

type SaleInput = z.output<typeof creditSaleSchema>
type Paid = z.output<typeof paymentField>[]

function references(type: SaleType, input: SaleInput): DocumentReferences {
    return {
        type,
        performedBy: input.performedBy,
        productIds: input.items.map((item) => item.productId),
        linkedDocumentId: null,
    }
}

type SaleType = "SALE" | "CREDIT_SALE"

function build(
    type: SaleType,
    input: SaleInput,
    context: LedgerContext,
    payments: Paid,
): NewLedgerDocument {
    const recordedAt = new Date()
    const id = newId()

    // The catalog price of this moment is what the sale is made at
    const priced = input.items.map((item) => {
        const unitPrice = context.products.get(item.productId)!.sellPrice
        return { ...item, unitPrice, subtotal: item.quantity * unitPrice - item.lineDiscount }
    })

    // Split to the cent, so the shares add up to the discount given. A discount
    // larger than what is being sold leaves a negative value, which the rules
    // reject.
    const shares = distribute(
        priced.map((item) => item.subtotal),
        input.documentDiscount,
    )

    return {
        id,
        type,
        occurredAt: input.occurredAt ?? recordedAt,
        recordedAt,
        performedBy: input.performedBy,
        linkedDocumentId: null,
        notes: input.notes,
        agreements: priced.map((item, position) => ({
            id: newId(),
            documentId: id,
            productId: item.productId,
            linkedAgreementId: null,
            // Stock leaves: quantities are stored negative
            quantity: -item.quantity,
            unitPrice: item.unitPrice,
            lineDiscount: item.lineDiscount,
            documentDiscountShare: shares[position],
            value: item.subtotal - shares[position],
        })),
        movements: priced.map((item) => ({
            id: newId(),
            documentId: id,
            productId: item.productId,
            linkedMovementId: null,
            quantity: -item.quantity,
        })),
        payments: payments.map((payment) => ({
            id: newId(),
            documentId: id,
            linkedPaymentId: null,
            method: payment.method,
            // Money arrives
            amount: payment.amount,
        })),
    }
}
