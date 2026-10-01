/**
 * Building the rows a document stores.
 *
 * Commands say what happened; the work of turning that into agreement, movement
 * and payment rows, with their ids, their signs and the columns their shape
 * requires, lives here whenever more than one command needs it. One function per
 * kind of cart, not one module per kind of document.
 */

import type { AgreementRow, LedgerDocument, MovementRow, PaymentRow } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { RuleViolationError } from "../errors.js"
import { distribute, sum } from "./money.js"
import type { LedgerContext } from "./context.js"
import type {
    movedItemsField,
    paymentsField,
    purchasedItemsField,
    soldItemsField,
} from "./fields.js"
import type { z } from "zod"

export type SoldItems = z.output<typeof soldItemsField>
export type PurchasedItems = z.output<typeof purchasedItemsField>
export type MovedItems = z.output<typeof movedItemsField>
export type Payments = z.output<typeof paymentsField>

/**
 * Which way something crosses the counter: into the shop, or out of it. Callers
 * count in positive units and cents, and this is what gives them their sign.
 */
export type Direction = "in" | "out"

function signed(amount: number, direction: Direction): number {
    return direction === "in" ? amount : -amount
}

/**
 * Builds the payment rows for money moving now.
 *
 * @param documentId - The document the rows belong to.
 * @param payments - How it was paid, as the caller counts it.
 * @param direction - Whether the money arrives or leaves.
 * @returns The payment rows, ready to store.
 */
export function paymentRows(
    documentId: string,
    payments: Payments,
    direction: Direction,
): PaymentRow[] {
    return payments.map((payment) => ({
        id: newId(),
        documentId,
        linkedPaymentId: null,
        method: payment.method,
        amount: signed(payment.amount, direction),
    }))
}

/**
 * Builds the movement rows for goods moving now.
 *
 * @param documentId - The document the rows belong to.
 * @param items - What moved, as the caller counts it.
 * @param direction - Whether the stock arrives or leaves.
 * @returns The movement rows, ready to store.
 */
export function movementRows(
    documentId: string,
    items: { productId: string; quantity: number }[],
    direction: Direction,
): MovementRow[] {
    return items.map((item) => ({
        id: newId(),
        documentId,
        productId: item.productId,
        linkedMovementId: null,
        quantity: signed(item.quantity, direction),
    }))
}

/**
 * Prices a cart of goods leaving, giving what a sale agrees. Whether the goods
 * leave now or later is the command's business, not this one's.
 *
 * Prices come from the catalog, never from the caller: the agreement stores the
 * catalog price of the moment, the discounts given and the net value, so a later
 * price change cannot alter what was sold.
 *
 * @param documentId - The document the rows belong to.
 * @param items - What is being sold, as the caller counts it.
 * @param documentDiscount - Discount over the whole cart.
 * @param context - Where the catalog prices are read from.
 * @returns The agreement rows, ready to store.
 */
export function priceItems(
    documentId: string,
    items: SoldItems,
    documentDiscount: number,
    context: LedgerContext,
): AgreementRow[] {
    // The catalog price of this moment is what the sale is made at
    const priced = items.map((item) => {
        const unitPrice = context.products.get(item.productId)!.sellPrice
        return { ...item, unitPrice, subtotal: item.quantity * unitPrice - item.lineDiscount }
    })

    // Split to the cent, so the shares add up to the discount given. A discount
    // larger than what is being sold leaves a negative value, which the rules
    // reject.
    const shares = distribute(
        priced.map((item) => item.subtotal),
        documentDiscount,
    )

    return priced.map((item, position) => ({
        id: newId(),
        documentId,
        productId: item.productId,
        linkedAgreementId: null,
        // Stock leaves: quantities are stored negative
        quantity: -item.quantity,
        unitPrice: item.unitPrice,
        lineDiscount: item.lineDiscount,
        documentDiscountShare: shares[position],
        value: item.subtotal - shares[position],
    }))
}

/**
 * Costs a cart of goods arriving, giving what a purchase agrees: what is owed
 * for them.
 *
 * Nothing is priced. What a unit is worth on the way in is not a fact the ledger
 * has - the supplier charged what they charged - so the line states its total and
 * the pricing columns stay empty. Whether the money and the goods move now or
 * later is the command's business, not this one's.
 *
 * @param documentId - The document the rows belong to.
 * @param items - What is being bought, as the caller counts it.
 * @returns The agreement rows, ready to store.
 */
export function costItems(documentId: string, items: PurchasedItems): AgreementRow[] {
    return items.map((item) => ({
        id: newId(),
        documentId,
        productId: item.productId,
        linkedAgreementId: null,
        // Stock arrives, and its cost is owed
        quantity: item.quantity,
        unitPrice: null,
        lineDiscount: null,
        documentDiscountShare: null,
        value: -item.totalCost,
    }))
}

/**
 * Refunds a cart of goods coming back, giving the rows a return stores: what is
 * owed back, and the goods that came with it.
 *
 * Every row points at the row of the sale it takes back and carries that row's
 * figures: the price it was sold at unchanged, because a price is a rate and the
 * quantity coming back is what reverses it, and its share of the discounts and
 * of what the line was worth, negated. A total of any of those columns over the
 * whole ledger therefore falls as goods come back, instead of standing at what
 * was sold.
 *
 * Every share is split on a running balance, the way a cart discount is: the
 * rounding error never accumulates and the last unit back takes what is left, so
 * returning a line in full always gives back exactly what it was worth, however
 * many trips it takes.
 *
 * @param documentId - The document the rows belong to.
 * @param items - What is coming back, as the caller counts it.
 * @param target - The sale being returned against.
 * @param history - Everything already hanging off that sale: earlier returns and
 * the voids that cancelled them.
 * @returns The agreement and movement rows, ready to store.
 * @throws {@link RuleViolationError} If a line names a product the sale never sold.
 */
export function refundItems(
    documentId: string,
    items: MovedItems,
    target: LedgerDocument,
    history: LedgerDocument[],
): { agreements: AgreementRow[]; movements: MovementRow[] } {
    const priorAgreements = history.flatMap((doc) => doc.agreements)
    const priorMovements = history.flatMap((doc) => doc.movements)

    const refunded = items.map((item) => {
        // The builder runs before the rules, so it says this itself rather than
        // reading a line that is not there; `returnsWithinSold` owns the quantity
        const sold = target.agreements.find((row) => row.productId === item.productId)
        const moved = target.movements.find((row) => row.productId === item.productId)
        if (!sold || !moved) {
            throw new RuleViolationError(`Nothing was sold for ${item.productId} on ${target.id}`)
        }

        const backBefore = sum(
            priorMovements
                .filter((row) => row.linkedMovementId === moved.id)
                .map((row) => row.quantity),
        )
        const taken = priorAgreements.filter((row) => row.linkedAgreementId === sold.id)

        /** This line's share of `whole`, less what earlier returns already took of it. */
        const share = (whole: number, alreadyTaken: number) =>
            Math.round((whole * (backBefore + item.quantity)) / Math.abs(sold.quantity)) -
            alreadyTaken

        return {
            ...item,
            sold,
            moved,
            value: share(sold.value, -sum(taken.map((row) => row.value))),
            lineDiscount: share(sold.lineDiscount!, -sum(taken.map((row) => row.lineDiscount!))),
            documentDiscountShare: share(
                sold.documentDiscountShare!,
                -sum(taken.map((row) => row.documentDiscountShare!)),
            ),
        }
    })

    return {
        agreements: refunded.map((item) => ({
            id: newId(),
            documentId,
            productId: item.productId,
            linkedAgreementId: item.sold.id,
            // Stock comes back, and the money for it is owed to the customer
            quantity: item.quantity,
            // A rate, so it is carried as it was; the quantity reverses it
            unitPrice: item.sold.unitPrice,
            lineDiscount: -item.lineDiscount,
            documentDiscountShare: -item.documentDiscountShare,
            value: -item.value,
        })),
        movements: refunded.map((item) => ({
            id: newId(),
            documentId,
            productId: item.productId,
            linkedMovementId: item.moved.id,
            quantity: item.quantity,
        })),
    }
}
