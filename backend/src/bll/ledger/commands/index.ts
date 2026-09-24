/**
 * Every command the ledger has: one file per document type.
 *
 * `VOID` is not written yet. Storage already knows the type
 * (`documentTypeValues`), and the rules it will need are already in place and
 * unused until then: `occursWhenRecorded`, `targetIsVoidable` and
 * `targetFullyMirrored` in `rules.ts`, and `SHAPES.mirrored`.
 *
 * When it lands, add the inventory here:
 *
 * ```ts
 * export const SPECS: Record<DocumentType, DocumentSpec> = {
 *     SALE: saleSpec, CREDIT_SALE: creditSaleSpec, RESTOCK: restockSpec,
 *     WRITE_OFF: writeOffSpec, PAYMENT_IN: paymentInSpec, VOID: voidSpec,
 * }
 * ```
 *
 * It is assembly, not definition - each spec stays in its own command file - and
 * it is what makes a type that storage knows but no command writes a compile
 * error. It cannot exist while a type is missing, which is the only reason it is
 * not here.
 */

export * from "./sale.js"
export * from "./creditSale.js"
export * from "./restock.js"
export * from "./writeOff.js"
export * from "./paymentIn.js"
