/**
 * Appending a document to the ledger.
 *
 * A write is always: check the input, load what the document will refer to, check
 * those references, build the rows, check the document, insert. Only the building
 * differs between document types, so everything else lives here.
 *
 * References are checked before building, so a builder can read prices and
 * original lines straight from the context without handling missing records.
 */

import * as dal from "../../dal/index.js"
import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { loadContext, type DocumentReferences, type LedgerContext } from "./context.js"
import { validateDocument, validateInContext, validateReferences } from "./rules.js"

/**
 * Checks a document and appends it to the ledger.
 *
 * Everything from the first read to the insert happens in one transaction, so the
 * document is built and checked against exactly the data it lands on.
 *
 * @param db - Active database client.
 * @param references - The records the document will point at.
 * @param build - Produces the document from what those references resolved to.
 * @returns The stored document.
 * @throws {@link NotFoundError} If it refers to something that does not exist.
 * @throws {@link InactiveError} If it refers to something inactive.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function post(
    db: DB,
    references: DocumentReferences,
    build: (context: LedgerContext) => NewLedgerDocument,
): LedgerDocument {
    return dal.inTransaction(db, () => {
        const context = loadContext(db, references)
        validateReferences(references, context)

        const doc = build(context)
        validateDocument(doc)
        // Again, in case the document ended up pointing where its references did not
        validateInContext(doc, context)

        return dal.insertDocument(db, doc)
    })
}
