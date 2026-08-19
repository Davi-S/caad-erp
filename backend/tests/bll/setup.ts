/**
 * Shared test setup utility providing isolated in-memory SQLite database instances for BLL unit tests.
 */

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { type DB, schema } from "../../src/dal/index.js"

/**
 * Creates and initializes an isolated in-memory SQLite database for BLL unit tests.
 *
 * @returns Fresh {@link DB} client instance connected to an in-memory database with created tables.
 */
export function createTestDb(): DB {
    const sqlite = new Database(":memory:")
    sqlite.exec(`
    CREATE TABLE IF NOT EXISTS products (
      product_id TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,
      sell_price INTEGER NOT NULL,
      is_active INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS salesmen (
      salesman_id TEXT PRIMARY KEY,
      salesman_name TEXT NOT NULL,
      is_active INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      transaction_id TEXT PRIMARY KEY,
      timestamp_iso TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(product_id),
      salesman_id TEXT NOT NULL REFERENCES salesmen(salesman_id),
      payment_type TEXT,
      quantity_change INTEGER NOT NULL,
      total_revenue INTEGER NOT NULL,
      total_cost INTEGER NOT NULL,
      linked_transaction_id TEXT,
      notes TEXT
    );
  `)
    return drizzle(sqlite, { schema })
}
