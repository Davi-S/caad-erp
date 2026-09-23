/**
 * Every command the ledger has.
 *
 * `SPECS` is assembly, not definition: each spec is stated in the command file
 * that uses it. Listing them here is what makes a type added to storage with no
 * command to write it a compile error.
 */

import type { DocumentType } from "../../../dal/index.js"
import type { DocumentSpec } from "../shapes.js"
import { creditSaleSpec } from "./creditSale.js"
import { paymentInSpec } from "./paymentIn.js"
import { restockSpec } from "./restock.js"
import { saleSpec } from "./sale.js"
import { voidSpec } from "./void.js"
import { writeOffSpec } from "./writeOff.js"

export * from "./sale.js"
export * from "./creditSale.js"
export * from "./restock.js"
export * from "./writeOff.js"
export * from "./paymentIn.js"
export * from "./void.js"

/** What the ledger can record: one spec per document type. */
export const SPECS: Record<DocumentType, DocumentSpec> = {
    SALE: saleSpec,
    CREDIT_SALE: creditSaleSpec,
    RESTOCK: restockSpec,
    WRITE_OFF: writeOffSpec,
    PAYMENT_IN: paymentInSpec,
    VOID: voidSpec,
}
