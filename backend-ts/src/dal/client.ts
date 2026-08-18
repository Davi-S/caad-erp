/**
 * Database client initializer and type exports.
 *
 * Configures the SQLite connection using `better-sqlite3` and initializes
 * the Drizzle ORM instance with the application schema.
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { products, salesmen, transactions } from './schema.js';

/**
 * Explicit schema dictionary containing all application tables.
 */
export const schema = { products, salesmen, transactions };

/**
 * Type alias for the configured Drizzle database connection instance.
 */
export type DB = BetterSQLite3Database<typeof schema>;

/**
 * Initializes and returns a Drizzle database client instance connected to SQLite.
 *
 * @param dbPath - Path to the SQLite database file, or `:memory:` for an in-memory database.
 * @returns The initialized {@link DB} client instance.
 */
export function createDb(dbPath: string = 'caad_erp.db'): DB {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema });
}
