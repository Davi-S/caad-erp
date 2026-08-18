/**
 * Data access layer primitives for the `salesmen` database table.
 *
 * Provides query helpers for iterating, fetching, appending, and updating
 * salesman records in the SQLite database using Drizzle ORM.
 */

import { eq } from 'drizzle-orm';
import type { DB } from './client.js';
import { salesmen, type SalesmanRow } from './schema.js';

/**
 * Retrieves all salesman records from the database.
 *
 * @param db - Active Drizzle database instance.
 * @returns Array of all {@link SalesmanRow} records currently stored.
 */
export function listSalesmen(db: DB): SalesmanRow[] {
  return db.select().from(salesmen).all();
}

/**
 * Fetches a single salesman record by its unique identifier.
 *
 * @param db - Active Drizzle database instance.
 * @param salesmanId - Unique identifier used to locate the salesman.
 * @returns The matching {@link SalesmanRow}, or `undefined` if missing.
 */
export function getSalesman(db: DB, salesmanId: string): SalesmanRow | undefined {
  return db
    .select()
    .from(salesmen)
    .where(eq(salesmen.salesmanId, salesmanId))
    .get();
}

/**
 * Inserts a new salesman record into the database.
 *
 * @param db - Active Drizzle database instance.
 * @param record - Complete salesman record to insert.
 * @returns The inserted {@link SalesmanRow} record.
 */
export function appendSalesman(db: DB, record: SalesmanRow): SalesmanRow {
  return db.insert(salesmen).values(record).returning().get();
}

/**
 * Updates selected fields for an existing salesman record.
 *
 * @param db - Active Drizzle database instance.
 * @param salesmanId - Identifier of the salesman to update.
 * @param fieldValues - Partial object containing field replacements to apply.
 * @returns The updated {@link SalesmanRow} record.
 * @throws {@link Error} If the salesman ID is not found or if `fieldValues` is empty.
 */
export function updateSalesman(
  db: DB,
  salesmanId: string,
  fieldValues: Partial<Omit<SalesmanRow, 'salesmanId'>>
): SalesmanRow {
  const existing = getSalesman(db, salesmanId);
  if (!existing) {
    throw new Error(`Salesman not found: ${salesmanId}`);
  }

  if (Object.keys(fieldValues).length === 0) {
    throw new Error(`At least one field must be provided to update salesman: ${salesmanId}`);
  }

  return db
    .update(salesmen)
    .set(fieldValues)
    .where(eq(salesmen.salesmanId, salesmanId))
    .returning()
    .get();
}
