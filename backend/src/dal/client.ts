/**
 * Database connection factory.
 *
 * The only place a connection is opened, so every connection gets the same
 * settings.
 */

import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

export type DB = BetterSQLite3Database

/**
 * Opens a SQLite database and wraps it in a Drizzle client.
 *
 * Foreign keys are enabled explicitly instead of relying on the driver's
 * compile-time default. The underlying connection is available as `db.$client`.
 *
 * @param dbPath - Path to the SQLite file, or `:memory:`.
 * @returns The Drizzle client.
 */
export function createDb(dbPath: string): DB {
    const sqlite = new Database(dbPath)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    return drizzle(sqlite)
}

/**
 * Runs `fn` inside a single SQLite transaction, rolling back if it throws.
 *
 * `better-sqlite3` is synchronous and uses one connection, so every DAL call made
 * with `db` inside `fn` is part of the transaction. Nested calls become savepoints.
 *
 * @param db - Drizzle client.
 * @param fn - Work to run atomically.
 * @returns Whatever `fn` returns.
 */
export function inTransaction<T>(db: DB, fn: () => T): T {
    return db.transaction(() => fn())
}
