/**
 * Data access for the `salesmen` table.
 */

import { eq } from "drizzle-orm"
import type { DB } from "./client.js"
import { salesmen, type SalesmanRow } from "./schema.js"

/**
 * @returns Every salesman.
 */
export function listSalesmen(db: DB): SalesmanRow[] {
    return db.select().from(salesmen).all()
}

/**
 * @returns The salesman with the given ID, or `undefined` if there is none.
 */
export function getSalesman(db: DB, id: string): SalesmanRow | undefined {
    return db.select().from(salesmen).where(eq(salesmen.id, id)).get()
}

/**
 * Inserts a salesman.
 *
 * @returns The stored row.
 */
export function insertSalesman(db: DB, record: SalesmanRow): SalesmanRow {
    return db.insert(salesmen).values(record).returning().get()
}

/**
 * Replaces the given fields of a salesman.
 *
 * @returns The updated row, or `undefined` if no salesman has the given ID.
 */
export function updateSalesman(
    db: DB,
    id: string,
    fields: Partial<Omit<SalesmanRow, "id">>,
): SalesmanRow | undefined {
    return db.update(salesmen).set(fields).where(eq(salesmen.id, id)).returning().get()
}
