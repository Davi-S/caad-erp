/**
 * Building the rows a document stores.
 *
 * Commands say what happened; the work of turning that into agreement, movement
 * and payment rows, with their ids, their signs and the columns their shape
 * requires, lives here whenever more than one command needs it. One function per
 * kind of cart, not one module per kind of document.
 */

import type { AgreementRow, MovementRow } from "../../dal/index.js"
import { newId } from "../../ids.js"
import { distribute } from "../money.js"
import type { LedgerContext } from "./context.js"
import type { soldItemsField } from "./fields.js"
import type { z } from "zod"

export type SoldItems = z.output<typeof soldItemsField>

/**
 * Prices a cart of goods leaving, giving the rows a sale stores: what was
 * agreed, and the goods that left with it.
 *
 * Prices come from the catalog, never from the caller: the agreement stores the
 * catalog price of the moment, the discounts given and the net value, so a later
 * price change cannot alter what was sold.
 *
 * @param documentId - The document the rows belong to.
 * @param items - What is being sold, as the caller counts it.
 * @param documentDiscount - Discount over the whole cart.
 * @param context - Where the catalog prices are read from.
 * @returns The agreement and movement rows, ready to store.
 */
export function priceItems(
    documentId: string,
    items: SoldItems,
    documentDiscount: number,
    context: LedgerContext,
): { agreements: AgreementRow[]; movements: MovementRow[] } {
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

    return {
        agreements: priced.map((item, position) => ({
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
        })),
        movements: priced.map((item) => ({
            id: newId(),
            documentId,
            productId: item.productId,
            linkedMovementId: null,
            quantity: -item.quantity,
        })),
    }
}
