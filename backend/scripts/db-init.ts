/**
 * Database initializer script.
 *
 * Creates a fresh SQLite database file at the given path (default: caad_erp.db)
 * with the full application schema applied and zero data rows.
 *
 * Usage:
 *   npx tsx scripts/db-init.ts [path/to/db.sqlite]
 */

import Database from "better-sqlite3"
import { resolve } from "path"

const dbPath = process.argv[2] ?? "caad_erp.db"
const resolvedPath = resolve(dbPath)

console.log(`Initializing empty database at: ${resolvedPath}`)

const db = new Database(resolvedPath)

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
        product_id   TEXT    NOT NULL PRIMARY KEY,
        product_name TEXT    NOT NULL,
        sell_price   INTEGER NOT NULL,
        is_active    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS salesmen (
        salesman_id   TEXT    NOT NULL PRIMARY KEY,
        salesman_name TEXT    NOT NULL,
        is_active     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
        transaction_id         TEXT    NOT NULL PRIMARY KEY,
        timestamp_iso          TEXT    NOT NULL,
        transaction_type       TEXT    NOT NULL,
        product_id             TEXT    NOT NULL REFERENCES products(product_id),
        salesman_id            TEXT    NOT NULL REFERENCES salesmen(salesman_id),
        payment_type           TEXT,
        quantity_change        INTEGER NOT NULL,
        total_revenue          INTEGER NOT NULL,
        total_cost             INTEGER NOT NULL,
        linked_transaction_id  TEXT,
        notes                  TEXT
    );
`)

db.close()

console.log("Done. Schema applied, no data inserted.")
