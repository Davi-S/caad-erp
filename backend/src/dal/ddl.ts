/**
 * SQL table definitions: the single source of truth for the database structure.
 *
 * DDL (Data Definition Language) is the part of SQL that defines structure
 * (`CREATE TABLE`, `CREATE INDEX`), as opposed to the statements that read and
 * write data (`SELECT`, `INSERT`, ...), which live in the other DAL files.
 *
 * Drizzle cannot declare `STRICT` tables, so the tables are created from this raw
 * SQL and `schema.ts` mirrors it for typed queries. The database only stores data:
 * it enforces column types, `NOT NULL`, primary keys and foreign keys. Every
 * business rule lives in the BLL.
 */

import type Database from "better-sqlite3"

const SCHEMA_SQL = `
    CREATE TABLE products (
        id                  TEXT     NOT NULL PRIMARY KEY,
        name                TEXT     NOT NULL,
        sell_price          INTEGER  NOT NULL,
        is_active           INTEGER  NOT NULL
    ) STRICT;

    CREATE TABLE salesmen (
        id                  TEXT     NOT NULL PRIMARY KEY,
        name                TEXT     NOT NULL,
        is_active           INTEGER  NOT NULL
    ) STRICT;

    CREATE TABLE documents (
        id                  TEXT     NOT NULL PRIMARY KEY,
        sequence            INTEGER  NOT NULL UNIQUE,
        type                TEXT     NOT NULL,
        occurred_at         INTEGER  NOT NULL,
        recorded_at         INTEGER  NOT NULL,
        salesman_id         TEXT     NOT NULL REFERENCES salesmen (id),
        linked_document_id  TEXT              REFERENCES documents (id),
        notes               TEXT
    ) STRICT;

    CREATE TABLE document_lines (
        id                  TEXT     NOT NULL PRIMARY KEY,
        document_id         TEXT     NOT NULL REFERENCES documents (id),
        product_id          TEXT     NOT NULL REFERENCES products (id),
        linked_line_id      TEXT              REFERENCES document_lines (id),
        quantity            INTEGER  NOT NULL,
        unit_price          INTEGER,
        item_discount       INTEGER,
        global_discount     INTEGER,
        amount              INTEGER,
        cost                INTEGER
    ) STRICT;

    CREATE TABLE payments (
        id                  TEXT     NOT NULL PRIMARY KEY,
        document_id         TEXT     NOT NULL REFERENCES documents (id),
        linked_payment_id   TEXT              REFERENCES payments (id),
        method              TEXT     NOT NULL,
        amount              INTEGER  NOT NULL
    ) STRICT;

    CREATE INDEX idx_documents_occurred_at        ON documents (occurred_at);
    CREATE INDEX idx_documents_linked_document_id ON documents (linked_document_id);
    CREATE INDEX idx_document_lines_document_id   ON document_lines (document_id);
    CREATE INDEX idx_document_lines_product_id    ON document_lines (product_id);
    CREATE INDEX idx_document_lines_linked_line   ON document_lines (linked_line_id);
    CREATE INDEX idx_payments_document_id         ON payments (document_id);
    CREATE INDEX idx_payments_linked_payment_id   ON payments (linked_payment_id);
`

/**
 * Creates every table and index on an empty database.
 *
 * Fails if any table already exists, so an outdated database is never silently
 * reused.
 *
 * @param sqlite - Open `better-sqlite3` connection to an empty database.
 */
export function applySchema(sqlite: Database.Database): void {
    sqlite.exec(SCHEMA_SQL)
}
