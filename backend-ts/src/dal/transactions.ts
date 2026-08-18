/**
 * Data access layer primitives for the `transactions` database table.
 *
 * Provides query helpers for iterating and appending transaction log
 * records in the SQLite database using Drizzle ORM.
 */

import type { DB } from './client.js';
import { transactions, type TransactionRow } from './schema.js';

/**
 * Retrieves all transaction log records from the database.
 *
 * @param db - Active Drizzle database instance.
 * @returns Array of all {@link TransactionRow} log records.
 */
export function listTransactions(db: DB): TransactionRow[] {
  return db.select().from(transactions).all();
}

/**
 * Appends a new transaction entry to the database transaction log.
 *
 * @param db - Active Drizzle database instance.
 * @param record - Complete transaction log entry to append.
 * @returns The inserted {@link TransactionRow} record.
 */
export function appendTransaction(db: DB, record: TransactionRow): TransactionRow {
  return db.insert(transactions).values(record).returning().get();
}
