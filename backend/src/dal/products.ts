/**
 * Data access for the `products` table and its append-only change trail,
 * `product_history`.
 *
 * Every write records a snapshot of the row it leaves behind, so the trail cannot
 * be forgotten by a caller. `changedBy` is stored as given and never interpreted
 * here: whose ID it is, is for the caller to decide.
 */

import { asc, eq, max } from "drizzle-orm"
import { newId } from "../ids.js"
import { inTransaction, type DB } from "./client.js"
import { productHistory, products, type ProductHistoryRow, type ProductRow } from "./schema.js"

/**
 * @returns Every product.
 */
export function listProducts(db: DB): ProductRow[] {
    return db.select().from(products).all()
}

/**
 * @returns The product with the given ID, or `undefined` if there is none.
 */
export function getProduct(db: DB, id: string): ProductRow | undefined {
    return db.select().from(products).where(eq(products.id, id)).get()
}

/**
 * Inserts a product and its first snapshot.
 *
 * @param changedBy - Identifier of the salesman the change is recorded against.
 * @returns The stored row.
 */
export function insertProduct(db: DB, record: ProductRow, changedBy: string): ProductRow {
    return inTransaction(db, () => {
        const product = db.insert(products).values(record).returning().get()
        recordSnapshot(db, product, changedBy)
        return product
    })
}

/**
 * Replaces the given fields of a product and records a snapshot of the result.
 *
 * @param changedBy - Identifier of the salesman the change is recorded against.
 * @returns The updated row, or `undefined` if no product has the given ID, in
 * which case nothing is written.
 */
export function updateProduct(
    db: DB,
    id: string,
    fields: Partial<Omit<ProductRow, "id">>,
    changedBy: string,
): ProductRow | undefined {
    return inTransaction(db, () => {
        const product = db.update(products).set(fields).where(eq(products.id, id)).returning().get()
        if (product) {
            recordSnapshot(db, product, changedBy)
        }
        return product
    })
}

/**
 * @returns Every snapshot of the given product, oldest first.
 */
export function listProductHistory(db: DB, productId: string): ProductHistoryRow[] {
    return db
        .select()
        .from(productHistory)
        .where(eq(productHistory.productId, productId))
        .orderBy(asc(productHistory.sequence))
        .all()
}

/**
 * Appends the state a write left the product in, with the next `sequence` number.
 *
 * Runs inside the caller's transaction, and SQLite allows a single writer, so two
 * snapshots never get the same number.
 */
function recordSnapshot(db: DB, product: ProductRow, changedBy: string): void {
    const last = db
        .select({ value: max(productHistory.sequence) })
        .from(productHistory)
        .get()

    db.insert(productHistory)
        .values({
            id: newId(),
            sequence: (last?.value ?? 0) + 1,
            productId: product.id,
            changedBy,
            recordedAt: new Date(),
            name: product.name,
            sellPrice: product.sellPrice,
            isActive: product.isActive,
        })
        .run()
}
