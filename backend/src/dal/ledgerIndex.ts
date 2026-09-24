/**
 * In-memory navigation over part of the ledger.
 *
 * Indexes documents by ID and follows `linked_document_id` backwards, from a
 * document to the documents that point at it. It only knows how documents point
 * to each other, not what that means: rules and derived values are the BLL's.
 *
 * It is a snapshot: build one per operation and do not keep it, since it does not
 * follow later changes to the database.
 */

import type { DB } from "./client.js"
import { listLinkedDocuments, type LedgerDocument } from "./documents.js"

export class LedgerIndex {
    private readonly docsById = new Map<string, LedgerDocument>()
    private readonly linkedDocs = new Map<string, LedgerDocument[]>()

    /**
     * Indexes a document and every document linking to it, directly or through
     * other linked documents. Empty if the document does not exist.
     */
    static loadLinkedTo(db: DB, documentId: string): LedgerIndex {
        const index = new LedgerIndex()
        for (const doc of listLinkedDocuments(db, documentId)) {
            index.add(doc)
        }
        return index
    }

    getDocument(id: string): LedgerDocument | undefined {
        return this.docsById.get(id)
    }

    /** Documents whose `linked_document_id` points to the given document. */
    linkedDocuments(docId: string): LedgerDocument[] {
        return this.linkedDocs.get(docId) ?? []
    }

    private add(doc: LedgerDocument): void {
        this.docsById.set(doc.id, doc)
        if (doc.linkedDocumentId) {
            const linked = this.linkedDocs.get(doc.linkedDocumentId)
            if (linked) {
                linked.push(doc)
            } else {
                this.linkedDocs.set(doc.linkedDocumentId, [doc])
            }
        }
    }
}
