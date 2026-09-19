/**
 * In-memory navigation over the ledger, or part of it.
 *
 * Indexes documents, lines and payments by ID and follows the link columns in
 * both directions (a row to what it links to, and a row to what links to it). It
 * only knows how rows point to each other, not what that means: rules and derived
 * values are the BLL's.
 *
 * It is a snapshot: build one per operation and do not keep it, since it does
 * not follow later changes to the database. It can hold the whole ledger, only
 * the documents linked to one document, or start empty and have documents added
 * one at a time (which lets the BLL replay the ledger and see it as it was before
 * each document).
 */

import type { DB } from "./client.js"
import { listDocuments, listLinkedDocuments, type LedgerDocument } from "./documents.js"
import type { DocumentLineRow, PaymentRow } from "./schema.js"

export class LedgerIndex {
    /** Every document, in the order it was added (`sequence` order when loaded). */
    readonly documents: LedgerDocument[] = []

    private readonly docsById = new Map<string, LedgerDocument>()
    private readonly linesById = new Map<string, DocumentLineRow>()
    private readonly paymentsById = new Map<string, PaymentRow>()
    private readonly linkedDocs = new Map<string, LedgerDocument[]>()
    private readonly lineReversers = new Map<string, DocumentLineRow[]>()
    private readonly paymentReversers = new Map<string, PaymentRow[]>()

    /**
     * Reads the whole ledger and indexes it.
     */
    static load(db: DB): LedgerIndex {
        return LedgerIndex.of(listDocuments(db))
    }

    /**
     * Indexes a document and every document linking to it, directly or through
     * other linked documents. Empty if the document does not exist.
     */
    static loadLinkedTo(db: DB, documentId: string): LedgerIndex {
        return LedgerIndex.of(listLinkedDocuments(db, documentId))
    }

    private static of(docs: LedgerDocument[]): LedgerIndex {
        const index = new LedgerIndex()
        for (const doc of docs) {
            index.add(doc)
        }
        return index
    }

    /**
     * Adds a stored document. Documents must be added in `sequence` order.
     */
    add(doc: LedgerDocument): void {
        this.documents.push(doc)
        this.docsById.set(doc.id, doc)
        if (doc.linkedDocumentId) {
            push(this.linkedDocs, doc.linkedDocumentId, doc)
        }
        for (const line of doc.lines) {
            this.linesById.set(line.id, line)
            if (line.linkedLineId) {
                push(this.lineReversers, line.linkedLineId, line)
            }
        }
        for (const payment of doc.payments) {
            this.paymentsById.set(payment.id, payment)
            if (payment.linkedPaymentId) {
                push(this.paymentReversers, payment.linkedPaymentId, payment)
            }
        }
    }

    getDocument(id: string): LedgerDocument | undefined {
        return this.docsById.get(id)
    }

    getLine(id: string): DocumentLineRow | undefined {
        return this.linesById.get(id)
    }

    getPayment(id: string): PaymentRow | undefined {
        return this.paymentsById.get(id)
    }

    /**
     * The document a line or payment belongs to.
     */
    documentOf(row: { documentId: string }): LedgerDocument {
        // Foreign keys guarantee the document exists
        return this.docsById.get(row.documentId)!
    }

    /** Documents whose `linked_document_id` points to the given document. */
    linkedDocuments(docId: string): LedgerDocument[] {
        return this.linkedDocs.get(docId) ?? []
    }

    /** Lines whose `linked_line_id` points to the given line. */
    lineReversals(lineId: string): DocumentLineRow[] {
        return this.lineReversers.get(lineId) ?? []
    }

    /** Payments whose `linked_payment_id` points to the given payment. */
    paymentReversals(paymentId: string): PaymentRow[] {
        return this.paymentReversers.get(paymentId) ?? []
    }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
    const list = map.get(key)
    if (list) {
        list.push(value)
    } else {
        map.set(key, [value])
    }
}
