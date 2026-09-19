/**
 * Data access for the `products` table.
 */

import { eq } from "drizzle-orm"
import type { DB } from "./client.js"
import { products, type ProductRow } from "./schema.js"

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
 * Inserts a product.
 *
 * @returns The stored row.
 */
export function insertProduct(db: DB, record: ProductRow): ProductRow {
    return db.insert(products).values(record).returning().get()
}

/**
 * Replaces the given fields of a product.
 *
 * @returns The updated row, or `undefined` if no product has the given ID.
 */
export function updateProduct(
    db: DB,
    id: string,
    fields: Partial<Omit<ProductRow, "id">>,
): ProductRow | undefined {
    return db.update(products).set(fields).where(eq(products.id, id)).returning().get()
}
