/**
 * Data access for the `salesmen` table and its append-only change trail,
 * `salesman_history`.
 *
 * Every write records a snapshot of the row it leaves behind, so the trail cannot
 * be forgotten by a caller. `changedBy` is stored as given and never interpreted
 * here: whose ID it is, is for the caller to decide.
 */

import { asc, eq } from "drizzle-orm"
import { newId } from "../ids.js"
import { inTransaction, nextSequence, type DB } from "./client.js"
import { salesmanHistory, salesmen, type SalesmanHistoryRow, type SalesmanRow } from "./schema.js"

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
 * Inserts a salesman and their first snapshot.
 *
 * @param changedBy - Identifier of the salesman the change is recorded against.
 * @returns The stored row.
 */
export function insertSalesman(db: DB, record: SalesmanRow, changedBy: string): SalesmanRow {
    return inTransaction(db, () => {
        const salesman = db.insert(salesmen).values(record).returning().get()
        recordSnapshot(db, salesman, changedBy)
        return salesman
    })
}

/**
 * Replaces the given fields of a salesman and records a snapshot of the result.
 *
 * @param changedBy - Identifier of the salesman the change is recorded against.
 * @returns The updated row, or `undefined` if no salesman has the given ID, in
 * which case nothing is written.
 */
export function updateSalesman(
    db: DB,
    id: string,
    fields: Partial<Omit<SalesmanRow, "id">>,
    changedBy: string,
): SalesmanRow | undefined {
    return inTransaction(db, () => {
        const salesman = db
            .update(salesmen)
            .set(fields)
            .where(eq(salesmen.id, id))
            .returning()
            .get()
        if (salesman) {
            recordSnapshot(db, salesman, changedBy)
        }
        return salesman
    })
}

/**
 * @returns Every snapshot of the given salesman, oldest first.
 */
export function listSalesmanHistory(db: DB, salesmanId: string): SalesmanHistoryRow[] {
    return db
        .select()
        .from(salesmanHistory)
        .where(eq(salesmanHistory.salesmanId, salesmanId))
        .orderBy(asc(salesmanHistory.sequence))
        .all()
}

/**
 * Appends the state a write left the salesman in, with the next `sequence`
 * number.
 */
function recordSnapshot(db: DB, salesman: SalesmanRow, changedBy: string): void {
    db.insert(salesmanHistory)
        .values({
            id: newId(),
            sequence: nextSequence(db, salesmanHistory, salesmanHistory.sequence),
            salesmanId: salesman.id,
            changedBy,
            recordedAt: new Date(),
            name: salesman.name,
            isActive: salesman.isActive,
        })
        .run()
}
