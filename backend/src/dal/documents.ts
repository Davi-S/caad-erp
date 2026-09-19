/**
 * Data access for the ledger: `documents`, `document_lines` and `payments`.
 *
 * The ledger is append-only: documents are inserted with their lines and payments
 * and never updated or deleted.
 */

import { asc, eq, max } from "drizzle-orm"
import { inTransaction, type DB } from "./client.js"
import {
    documentLines,
    documents,
    payments,
    type DocumentLineRow,
    type DocumentRow,
    type PaymentRow,
} from "./schema.js"

/**
 * A document together with its lines and payments.
 *
 * Lines and payments have no meaningful order: they are sorted by ID only so that
 * repeated reads return the same order. Do not rely on it.
 */
export interface LedgerDocument extends DocumentRow {
    lines: DocumentLineRow[]
    payments: PaymentRow[]
}

/**
 * A document to insert: `sequence` is assigned on insert.
 */
export type NewLedgerDocument = Omit<LedgerDocument, "sequence">

/**
 * Reads the whole ledger.
 *
 * @returns Every document with its lines and payments, in the order they were
 * entered (`sequence`).
 */
export function listDocuments(db: DB): LedgerDocument[] {
    const docs = db.select().from(documents).orderBy(asc(documents.sequence)).all()
    const allLines = db.select().from(documentLines).orderBy(asc(documentLines.id)).all()
    const allPayments = db.select().from(payments).orderBy(asc(payments.id)).all()

    const byId = new Map<string, LedgerDocument>()
    for (const doc of docs) {
        byId.set(doc.id, { ...doc, lines: [], payments: [] })
    }
    for (const line of allLines) {
        byId.get(line.documentId)!.lines.push(line)
    }
    for (const payment of allPayments) {
        byId.get(payment.documentId)!.payments.push(payment)
    }

    return [...byId.values()]
}

/**
 * Reads one document by key.
 *
 * @returns The document with its lines and payments, or `undefined` if there is
 * none.
 */
export function getDocument(db: DB, id: string): LedgerDocument | undefined {
    const doc = db.select().from(documents).where(eq(documents.id, id)).get()
    if (!doc) {
        return undefined
    }

    return {
        ...doc,
        lines: db
            .select()
            .from(documentLines)
            .where(eq(documentLines.documentId, id))
            .orderBy(asc(documentLines.id))
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
 * Inserts a document with its lines and payments atomically, giving it the next
 * `sequence` number.
 *
 * Reading the last sequence and inserting happen in the same transaction, and
 * SQLite allows a single writer, so two documents never get the same number.
 *
 * @returns The document as stored.
 */
export function insertDocument(db: DB, record: NewLedgerDocument): LedgerDocument {
    const { lines, payments: docPayments, ...doc } = record

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
        const storedLines = lines.map((line) =>
            db.insert(documentLines).values(line).returning().get(),
        )
        const storedPayments = docPayments.map((payment) =>
            db.insert(payments).values(payment).returning().get(),
        )
        return { ...stored, lines: storedLines, payments: storedPayments }
    })
}
