/**
 * Data access for the ledger: `documents`, `agreements`, `movements` and `payments`.
 *
 * A document carries three kinds of row: what was agreed, what goods moved and
 * what money moved. Any of them can be absent, and which are expected is the
 * BLL's business.
 *
 * The ledger is append-only: documents are inserted with their rows and never
 * updated or deleted.
 */

import { asc, inArray, sql } from "drizzle-orm"
import { inTransaction, nextSequence, type DB } from "./client.js"
import {
    documents,
    movements,
    payments,
    agreements,
    type DocumentRow,
    type MovementRow,
    type PaymentRow,
    type AgreementRow,
} from "./schema.js"

/**
 * A document together with everything stored under it.
 *
 * The rows have no meaningful order: they are sorted by ID only so that repeated
 * reads return the same order. Do not rely on it.
 */
export interface LedgerDocument extends DocumentRow {
    agreements: AgreementRow[]
    movements: MovementRow[]
    payments: PaymentRow[]
}

/**
 * A document to insert: `sequence` is assigned on insert.
 */
export type NewLedgerDocument = Omit<LedgerDocument, "sequence">

/**
 * Reads the whole ledger.
 *
 * @returns Every document with its rows, in the order they were entered
 * (`sequence`).
 */
export function listDocuments(db: DB): LedgerDocument[] {
    return load(db)
}

/**
 * Reads a document and every document linking to it, directly or through other
 * linked documents, following `linked_document_id` until no more are found.
 *
 * @returns The documents with their rows, in `sequence` order; empty if the
 * document does not exist.
 */
export function listLinkedDocuments(db: DB, id: string): LedgerDocument[] {
    const ids = db
        .all<{ id: string }>(
            sql`WITH RECURSIVE linked(id) AS (
                    SELECT id FROM documents WHERE id = ${id}
                    UNION
                    SELECT d.id FROM documents d JOIN linked l ON d.linked_document_id = l.id
                )
                SELECT id FROM linked`,
        )
        .map((row) => row.id)
    return ids.length === 0 ? [] : load(db, ids)
}

/**
 * Reads one document by key.
 *
 * @returns The document with its rows, or `undefined` if there is none.
 */
export function getDocument(db: DB, id: string): LedgerDocument | undefined {
    return load(db, [id])[0]
}

/**
 * Inserts a document with its rows atomically, giving it the next `sequence`
 * number.
 *
 * @returns The document as stored.
 */
export function insertDocument(db: DB, record: NewLedgerDocument): LedgerDocument {
    const {
        agreements: docAgreements,
        movements: docMovements,
        payments: docPayments,
        ...doc
    } = record

    return inTransaction(db, () => {
        const stored = db
            .insert(documents)
            .values({ ...doc, sequence: nextSequence(db, documents, documents.sequence) })
            .returning()
            .get()

        // One statement per kind of row. Read back rather than echoed, so the
        // caller gets what SQLite stored (a -0 comes back as 0, for one)
        return {
            ...stored,
            agreements:
                docAgreements.length > 0
                    ? inOrderOf(
                          docAgreements,
                          db.insert(agreements).values(docAgreements).returning().all(),
                      )
                    : [],
            movements:
                docMovements.length > 0
                    ? inOrderOf(
                          docMovements,
                          db.insert(movements).values(docMovements).returning().all(),
                      )
                    : [],
            payments:
                docPayments.length > 0
                    ? inOrderOf(
                          docPayments,
                          db.insert(payments).values(docPayments).returning().all(),
                      )
                    : [],
        }
    })
}

/**
 * Puts rows read back from `RETURNING` in the order they were given: SQLite does
 * not promise any order for them.
 */
function inOrderOf<T extends { id: string }>(given: T[], stored: T[]): T[] {
    const byId = new Map(stored.map((row) => [row.id, row]))
    return given.map((row) => byId.get(row.id)!)
}

/**
 * Reads documents with their rows: the given ones, or every one.
 */
function load(db: DB, ids?: string[]): LedgerDocument[] {
    return group(
        db
            .select()
            .from(documents)
            .where(ids && inArray(documents.id, ids))
            .orderBy(asc(documents.sequence))
            .all(),
        db
            .select()
            .from(agreements)
            .where(ids && inArray(agreements.documentId, ids))
            .orderBy(asc(agreements.id))
            .all(),
        db
            .select()
            .from(movements)
            .where(ids && inArray(movements.documentId, ids))
            .orderBy(asc(movements.id))
            .all(),
        db
            .select()
            .from(payments)
            .where(ids && inArray(payments.documentId, ids))
            .orderBy(asc(payments.id))
            .all(),
    )
}

/**
 * Puts the rows under their documents, keeping the documents' order.
 */
function group(
    docs: DocumentRow[],
    docAgreements: AgreementRow[],
    docMovements: MovementRow[],
    docPayments: PaymentRow[],
): LedgerDocument[] {
    const byId = new Map<string, LedgerDocument>()
    for (const doc of docs) {
        byId.set(doc.id, { ...doc, agreements: [], movements: [], payments: [] })
    }
    for (const row of docAgreements) {
        byId.get(row.documentId)!.agreements.push(row)
    }
    for (const row of docMovements) {
        byId.get(row.documentId)!.movements.push(row)
    }
    for (const row of docPayments) {
        byId.get(row.documentId)!.payments.push(row)
    }
    return [...byId.values()]
}
