/**
 * Appending a document to the ledger.
 *
 * A write is always: check the input, gather what it refers to, build the rows,
 * check the rules, insert. Only the building differs between document types, so
 * the last two steps live here.
 */

import * as dal from "../../dal/index.js"
import type { DB, LedgerDocument, NewLedgerDocument } from "../../dal/index.js"
import { validateDocument } from "./rules.js"

/**
 * Checks a document and appends it to the ledger.
 *
 * Building and checking happen inside the same transaction as the insert, so the
 * document is checked against exactly the data it lands on.
 *
 * @param db - Active database client.
 * @param build - Produces the document to store.
 * @returns The stored document.
 * @throws {@link RuleViolationError} If the document breaks a rule.
 */
export function post(db: DB, build: () => NewLedgerDocument): LedgerDocument {
    return dal.inTransaction(db, () => {
        const doc = build()
        validateDocument(doc)
        return dal.insertDocument(db, doc)
    })
}
