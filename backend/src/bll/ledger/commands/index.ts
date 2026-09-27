/**
 * Every command the ledger has: one file per document type.
 *
 * `SPECS` is assembly, not definition: each spec is stated in the command file
 * that uses it. Listing them here is what makes a type that storage knows but no
 * command writes a compile error.
 */

import type { DocumentType } from "../../../dal/index.js"
import type { DocumentSpec } from "../shapes.js"
import { creditRestockSpec } from "./creditRestock.js"
import { deliveryInSpec } from "./deliveryIn.js"
import { creditSaleSpec } from "./creditSale.js"
import { deliveryOutSpec } from "./deliveryOut.js"
import { paymentInSpec } from "./paymentIn.js"
import { paymentOutSpec } from "./paymentOut.js"
import { prePaidRestockSpec } from "./prePaidRestock.js"
import { prePaidSaleSpec } from "./prePaidSale.js"
import { restockSpec } from "./restock.js"
import { saleSpec } from "./sale.js"
import { voidSpec } from "./void.js"
import { writeOffSpec } from "./writeOff.js"

export * from "./sale.js"
export * from "./creditSale.js"
export * from "./creditRestock.js"
export * from "./prePaidRestock.js"
export * from "./prePaidSale.js"
export * from "./restock.js"
export * from "./writeOff.js"
export * from "./paymentIn.js"
export * from "./paymentOut.js"
export * from "./deliveryOut.js"
export * from "./deliveryIn.js"
export * from "./void.js"

/** What the ledger can record. */
export const SPECS: Record<DocumentType, DocumentSpec> = {
    SALE: saleSpec,
    CREDIT_SALE: creditSaleSpec,
    PRE_PAID_SALE: prePaidSaleSpec,
    RESTOCK: restockSpec,
    CREDIT_RESTOCK: creditRestockSpec,
    PRE_PAID_RESTOCK: prePaidRestockSpec,
    WRITE_OFF: writeOffSpec,
    PAYMENT_IN: paymentInSpec,
    PAYMENT_OUT: paymentOutSpec,
    DELIVERY_OUT: deliveryOutSpec,
    DELIVERY_IN: deliveryInSpec,
    VOID: voidSpec,
}
