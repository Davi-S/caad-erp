/**
 * Every command the ledger has: one file per document type.
 *
 * `PAYMENT_IN` and `VOID` are not written yet. Storage already knows both
 * (`documentTypeValues`), and the rules they will need are already in place and
 * unused until then: `occursWhenRecorded`, `targetNotVoided`, `targetIsVoidable`
 * and `targetFullyMirrored` in `rules.ts`, and `SHAPES.mirrored`.
 *
 * When the last two land, add the inventory here:
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
 * error. It cannot exist while two types are missing, which is the only reason it
 * is not here.
 */

export * from "./sale.js"
export * from "./creditSale.js"
export * from "./restock.js"
export * from "./writeOff.js"
