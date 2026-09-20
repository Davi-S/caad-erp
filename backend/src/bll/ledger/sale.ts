/**
 * Sales: goods going out, and the money taken for them.
 *
 * Prices come from the catalog, never from the caller: the line stores the
 * catalog price of the moment, the discounts given, and the net amount charged,
 * so a later price change cannot alter what was sold.
 *
 * Payments are whatever was taken at the counter. Less than the total leaves a
 * balance the salesman owes, which is what a credit sale is; more than the total
 * is a tip. Neither is rejected here.
 */

import type { DB, DocumentLineRow, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { distribute } from "../money.js"
import { validate } from "../validate.js"
import { documentFields, paymentField, productIdField, quantityField } from "./fields.js"
import { post } from "./post.js"
import { z } from "zod"

/**
 * Input for recording a sale.
 *
 * `itemDiscount` comes off that line; `globalDiscount` comes off the whole cart
 * and is split across the lines in proportion to what they cost.
 */
export const saleSchema = z.object({
    ...documentFields,
    items: z
        .array(
            z.object({
                productId: productIdField,
                quantity: quantityField,
                itemDiscount: z
                    .int("Discount must be a whole number of cents")
                    .nonnegative("Discount cannot be negative")
                    .default(0),
            }),
        )
        .min(1, "At least one item is required"),
    globalDiscount: z
        .int("Discount must be a whole number of cents")
        .nonnegative("Discount cannot be negative")
        .default(0),
    payments: z.array(paymentField).default([]),
})

export type SaleCommand = z.input<typeof saleSchema>

/**
 * Records a sale.
 *
 * @param command - Raw input matching {@link saleSchema}.
 * @returns The stored document.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman or a product does not exist.
 * @throws {@link InactiveError} If the salesman or a product is inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule, such as a
 * discount larger than what is being sold.
 */
export function recordSale(db: DB, command: SaleCommand): LedgerDocument {
    const input = validate(saleSchema, command)

    const references = {
        type: "SALE",
        salesmanId: input.salesmanId,
        productIds: input.items.map((item) => item.productId),
        linkedDocumentId: null,
    } as const

    return post(db, references, (context) => {
        const recordedAt = new Date()
        const id = newId()

        // The catalog price of this moment is what the sale is made at
        const priced = input.items.map((item) => {
            const unitPrice = context.products.get(item.productId)!.sellPrice
            return {
                ...item,
                unitPrice,
                subtotal: item.quantity * unitPrice - item.itemDiscount,
            }
        })

        // A discount larger than what is being sold cannot be split; the document
        // is built with no split at all and the rules reject it
        const total = priced.reduce((sum, item) => sum + item.subtotal, 0)
        const splittable =
            priced.every((item) => item.subtotal >= 0) && input.globalDiscount <= total
        const shares = splittable
            ? distribute(
                  priced.map((item) => item.subtotal),
                  input.globalDiscount,
              )
            : priced.map(() => input.globalDiscount)

        const lines: DocumentLineRow[] = priced.map((item, position) => ({
            id: newId(),
            documentId: id,
            productId: item.productId,
            linkedLineId: null,
            // Stock leaves: quantities are stored negative
            quantity: -item.quantity,
            unitPrice: item.unitPrice,
            itemDiscount: item.itemDiscount,
            globalDiscount: shares[position],
            amount: item.subtotal - shares[position],
            cost: null,
        }))

        const doc: NewLedgerDocument = {
            id,
            type: "SALE",
            occurredAt: input.occurredAt ?? recordedAt,
            recordedAt,
            salesmanId: input.salesmanId,
            linkedDocumentId: null,
            notes: input.notes,
            lines,
            payments: input.payments.map((payment) => ({
                id: newId(),
                documentId: id,
                linkedPaymentId: null,
                method: payment.method,
                // Money arrives: payments for goods are stored positive
                amount: payment.amount,
            })),
        }
        return doc
    })
}
