/**
 * What a document refers to, gathered from storage so the rules can be checked
 * against it, and so builders never touch the database.
 *
 * Loading is mechanical: it reads the IDs it is given and knows nothing about the
 * rules. Deciding whether what it found is acceptable is `rules.ts`'s job.
 */

import * as dal from "../../dal/index.js"
import type { DB, DocumentType, LedgerIndex, ProductRow, SalesmanRow } from "../../dal/index.js"

/**
 * The records a document will point at, named before it is built.
 */
export interface DocumentReferences {
    type: DocumentType
    performedBy: string
    productIds: string[]
    linkedDocumentId: string | null
}

/**
 * Everything those references resolved to: the products, the salesman, and the
 * linked document with everything linked to it.
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
 * Reads the records a document refers to.
 *
 * @param db - Active database client.
 * @param references - What the document will point at.
 * @returns The rows named, found or not.
 */
export function loadContext(db: DB, references: DocumentReferences): LedgerContext {
    const products = new Map<string, ProductRow>()
    for (const productId of new Set(references.productIds)) {
        const product = dal.getProduct(db, productId)
        if (product) {
            products.set(productId, product)
        }
    }

    return {
        products,
        salesman: dal.getSalesman(db, references.performedBy),
        linked: references.linkedDocumentId
            ? dal.LedgerIndex.loadLinkedTo(db, references.linkedDocumentId)
            : new dal.LedgerIndex(),
    }
}
