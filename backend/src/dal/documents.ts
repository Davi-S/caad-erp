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

import { asc, eq, inArray, max, sql } from "drizzle-orm"
import { inTransaction, type DB } from "./client.js"
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
    return group(
        db.select().from(documents).orderBy(asc(documents.sequence)).all(),
        db.select().from(agreements).orderBy(asc(agreements.id)).all(),
        db.select().from(movements).orderBy(asc(movements.id)).all(),
        db.select().from(payments).orderBy(asc(payments.id)).all(),
    )
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
    if (ids.length === 0) {
        return []
    }

    return group(
        db
            .select()
            .from(documents)
            .where(inArray(documents.id, ids))
            .orderBy(asc(documents.sequence))
            .all(),
        db
            .select()
            .from(agreements)
            .where(inArray(agreements.documentId, ids))
            .orderBy(asc(agreements.id))
            .all(),
        db
            .select()
            .from(movements)
            .where(inArray(movements.documentId, ids))
            .orderBy(asc(movements.id))
            .all(),
        db
            .select()
            .from(payments)
            .where(inArray(payments.documentId, ids))
            .orderBy(asc(payments.id))
            .all(),
    )
}

/**
 * Reads one document by key.
 *
 * @returns The document with its rows, or `undefined` if there is none.
 */
export function getDocument(db: DB, id: string): LedgerDocument | undefined {
    const doc = db.select().from(documents).where(eq(documents.id, id)).get()
    if (!doc) {
        return undefined
    }

    return {
        ...doc,
        agreements: db
            .select()
            .from(agreements)
            .where(eq(agreements.documentId, id))
            .orderBy(asc(agreements.id))
            .all(),
        movements: db
            .select()
            .from(movements)
            .where(eq(movements.documentId, id))
            .orderBy(asc(movements.id))
            .all(),
        payments: db
            .select()
            .from(payments)
            .where(eq(payments.documentId, id))
            .orderBy(asc(payments.id))
            .all(),
    }
}

/**
 * Inserts a document with its rows atomically, giving it the next `sequence`
 * number.
 *
 * Reading the last sequence and inserting happen in the same transaction, and
 * SQLite allows a single writer, so two documents never get the same number.
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
        const last = db
            .select({ value: max(documents.sequence) })
            .from(documents)
            .get()
        const sequence = (last?.value ?? 0) + 1

        const stored = db
            .insert(documents)
            .values({ ...doc, sequence })
            .returning()
            .get()

        return {
            ...stored,
            agreements: docAgreements.map((row) =>
                db.insert(agreements).values(row).returning().get(),
            ),
            movements: docMovements.map((row) =>
                db.insert(movements).values(row).returning().get(),
            ),
            payments: docPayments.map((row) => db.insert(payments).values(row).returning().get()),
        }
    })
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
