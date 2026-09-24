/**
 * SQL table definitions: the single source of truth for the database structure.
 *
 * DDL (Data Definition Language) is the part of SQL that defines structure
 * (`CREATE TABLE`, `CREATE INDEX`), as opposed to the statements that read and
 * write data (`SELECT`, `INSERT`, ...), which live in the other DAL files.
 *
 * Drizzle cannot declare `STRICT` tables, so the tables are created from this raw
 * SQL and `schema.ts` mirrors it for typed queries. The database only stores data:
 * it enforces column types, `NOT NULL`, primary keys and foreign keys, and
 * nothing else.
 *
 * A document carries three kinds of row: what was agreed (`agreements`), what
 * goods moved (`movements`) and what money moved (`payments`). Money lives on the
 * agreement, goods on the movement, so each table means one thing.
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

    CREATE TABLE product_history (
        id                  TEXT     NOT NULL PRIMARY KEY,
        sequence            INTEGER  NOT NULL UNIQUE,
        product_id          TEXT     NOT NULL REFERENCES products (id),
        changed_by          TEXT     NOT NULL REFERENCES salesmen (id),
        recorded_at         INTEGER  NOT NULL,
        name                TEXT     NOT NULL,
        sell_price          INTEGER  NOT NULL,
        is_active           INTEGER  NOT NULL
    ) STRICT;

    CREATE TABLE salesman_history (
        id                  TEXT     NOT NULL PRIMARY KEY,
        sequence            INTEGER  NOT NULL UNIQUE,
        salesman_id         TEXT     NOT NULL REFERENCES salesmen (id),
        changed_by          TEXT     NOT NULL REFERENCES salesmen (id),
        recorded_at         INTEGER  NOT NULL,
        name                TEXT     NOT NULL,
        is_active           INTEGER  NOT NULL
    ) STRICT;

    CREATE TABLE documents (
        id                  TEXT     NOT NULL PRIMARY KEY,
        sequence            INTEGER  NOT NULL UNIQUE,
        type                TEXT     NOT NULL,
        occurred_at         INTEGER  NOT NULL,
        recorded_at         INTEGER  NOT NULL,
        performed_by        TEXT     NOT NULL REFERENCES salesmen (id),
        linked_document_id  TEXT              REFERENCES documents (id),
        notes               TEXT
    ) STRICT;

    CREATE TABLE agreements (
        id                      TEXT     NOT NULL PRIMARY KEY,
        document_id             TEXT     NOT NULL REFERENCES documents (id),
        product_id              TEXT     NOT NULL REFERENCES products (id),
        linked_agreement_id     TEXT              REFERENCES agreements (id),
        quantity                INTEGER  NOT NULL,
        unit_price              INTEGER,
        line_discount           INTEGER,
        document_discount_share INTEGER,
        value                   INTEGER  NOT NULL
    ) STRICT;

    CREATE TABLE movements (
        id                  TEXT     NOT NULL PRIMARY KEY,
        document_id         TEXT     NOT NULL REFERENCES documents (id),
        product_id          TEXT     NOT NULL REFERENCES products (id),
        linked_movement_id  TEXT              REFERENCES movements (id),
        quantity            INTEGER  NOT NULL
    ) STRICT;

    CREATE TABLE payments (
        id                  TEXT     NOT NULL PRIMARY KEY,
        document_id         TEXT     NOT NULL REFERENCES documents (id),
        linked_payment_id   TEXT              REFERENCES payments (id),
        method              TEXT     NOT NULL,
        amount              INTEGER  NOT NULL
    ) STRICT;

    CREATE INDEX idx_product_history_product_id   ON product_history (product_id);
    CREATE INDEX idx_salesman_history_salesman_id ON salesman_history (salesman_id);
    CREATE INDEX idx_documents_occurred_at        ON documents (occurred_at);
    CREATE INDEX idx_documents_linked_document_id ON documents (linked_document_id);
    CREATE INDEX idx_agreements_document_id       ON agreements (document_id);
    CREATE INDEX idx_agreements_product_id        ON agreements (product_id);
    CREATE INDEX idx_agreements_linked_agreement_id ON agreements (linked_agreement_id);
    CREATE INDEX idx_movements_document_id        ON movements (document_id);
    CREATE INDEX idx_movements_product_id         ON movements (product_id);
    CREATE INDEX idx_movements_linked_movement_id ON movements (linked_movement_id);
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
