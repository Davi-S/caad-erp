/**
 * What a document refers to, gathered from storage so the rules can be checked
 * against it.
 *
 * Loading is mechanical: it follows the IDs the document carries and knows
 * nothing about the rules. Deciding whether what it found is acceptable is
 * `validateInContext`'s job, in `rules.ts`.
 */

import * as dal from "../../dal/index.js"
import type {
    DB,
    LedgerIndex,
    NewLedgerDocument,
    ProductRow,
    SalesmanRow,
} from "../../dal/index.js"

/**
 * Everything a document points at: the products its lines move, the salesman who
 * performed it, and the documents linked to the one it reverses or settles.
 *
 * Missing entries are kept as missing (`undefined`, or absent from the map) so
 * the rules can say which reference is wrong.
 */
export interface LedgerContext {
    products: Map<string, ProductRow>
    salesman: SalesmanRow | undefined
    /** The linked document with everything linked to it; empty when there is none. */
    linked: LedgerIndex
}

/**
 * Reads what the document refers to.
 *
 * @param db - Active database client.
 * @param doc - The document about to be stored.
 * @returns The rows it names, found or not.
 */
export function loadContext(db: DB, doc: NewLedgerDocument): LedgerContext {
    const products = new Map<string, ProductRow>()
    for (const productId of new Set(doc.lines.map((line) => line.productId))) {
        const product = dal.getProduct(db, productId)
        if (product) {
            products.set(productId, product)
        }
    }

    return {
        products,
        salesman: dal.getSalesman(db, doc.salesmanId),
        linked: doc.linkedDocumentId
            ? dal.LedgerIndex.loadLinkedTo(db, doc.linkedDocumentId)
            : new dal.LedgerIndex(),
    }
}
