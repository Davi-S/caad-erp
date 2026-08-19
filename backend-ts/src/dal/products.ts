/**
 * Data access layer primitives for the `products` database table.
 *
 * Provides query helpers for iterating, fetching, appending, and updating
 * product records in the SQLite database using Drizzle ORM.
 */

import { eq } from "drizzle-orm"
import type { DB } from "./client.js"
import { products, type ProductRow } from "./schema.js"

/**
 * Retrieves all product records from the database.
 *
 * @param db - Active Drizzle database instance.
 * @returns Array of all {@link ProductRow} records currently stored.
 */
export function listProducts(db: DB): ProductRow[] {
    return db.select().from(products).all()
}

/**
 * Fetches a single product record by its unique identifier.
 *
 * @param db - Active Drizzle database instance.
 * @param id - Unique identifier used to locate the product.
 * @returns The matching {@link ProductRow}, or `undefined` if missing.
 */
export function getProduct(db: DB, id: string): ProductRow | undefined {
    return db.select().from(products).where(eq(products.id, id)).get()
}

/**
 * Inserts a new product record into the database.
 *
 * @param db - Active Drizzle database instance.
 * @param record - Complete product record to insert.
 * @returns The inserted {@link ProductRow} record.
 */
export function appendProduct(db: DB, record: ProductRow): ProductRow {
    return db.insert(products).values(record).returning().get()
}

/**
 * Updates selected fields for an existing product record.
 *
 * @param db - Active Drizzle database instance.
 * @param id - Identifier of the product to update.
 * @param fieldValues - Partial object containing field replacements to apply.
 * @returns The updated {@link ProductRow} record.
 * @throws {@link Error} If the product ID is not found or if `fieldValues` is empty.
 */
export function updateProduct(
    db: DB,
    id: string,
    fieldValues: Partial<Omit<ProductRow, "id">>,
): ProductRow {
    const existing = getProduct(db, id)
    if (!existing) {
        throw new Error(`Product not found: ${id}`)
    }

    if (Object.keys(fieldValues).length === 0) {
        throw new Error(`At least one field must be provided to update product: ${id}`)
    }

    return db.update(products).set(fieldValues).where(eq(products.id, id)).returning().get()
}
