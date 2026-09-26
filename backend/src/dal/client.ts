/**
 * Database connection factory.
 *
 * The only place a connection is opened, so every connection gets the same
 * settings.
 */

import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

/**
 * A Drizzle client over an open SQLite connection.
 *
 * `$client` is that connection, which `applySchema` and the pragmas need.
 */
export type DB = BetterSQLite3Database & { $client: Database.Database }

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
 * with `db` inside `fn` is part of the transaction. Nested calls become savepoints,
 * and only the outermost one opens the transaction.
 *
 * It begins as `IMMEDIATE`, taking the write lock at the start rather than on the
 * first write. Every caller writes, and several read a number they are about to
 * base a write on (`MAX(sequence) + 1`); with a deferred transaction two writers
 * can read the same number and the second one fails on the unique index instead of
 * waiting its turn.
 *
 * @param db - Drizzle client.
 * @param fn - Work to run atomically.
 * @returns Whatever `fn` returns.
 */
export function inTransaction<T>(db: DB, fn: () => T): T {
    return db.transaction(() => fn(), { behavior: "immediate" })
}
