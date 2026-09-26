/**
 * Fixtures for the BLL tests.
 *
 * Records are created through the commands, the way the application creates them,
 * so a test never sets up state the rules would have refused. The derived sums are
 * here too: they are what the reports will read, and the point of most of these
 * tests is that they come out right.
 */

import * as bll from "../../src/bll/index.js"
import * as dal from "../../src/dal/index.js"
import type { DB, LedgerDocument, NewLedgerDocument, SalesmanRow } from "../../src/dal/index.js"
import { freshDb } from "../fixtures.js"

/** A fixed moment, so nothing depends on the clock unless it says so. */
export const AT = new Date("2026-01-02T15:00:00.000Z")

/**
 * An empty ledger with one salesman: the first one, who is their own author.
 */
export function setup(): { db: DB; boss: SalesmanRow } {
    const db = freshDb()
    return { db, boss: bll.createFirstSalesman(db, { name: "Boss" }) }
}

/**
 * What the whole ledger adds up to: the three sums the reports are built from.
 *
 * `agreed` is what the store gained on paper, `cash` what actually moved, `stock`
 * what is on the shelf. A void makes all three fall back on their own, because its
 * rows are the negation of the rows it takes back.
 */
export function totals(db: DB): { stock: number; cash: number; agreed: number } {
    const documents = dal.listDocuments(db)
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
    return {
        stock: sum(documents.flatMap((doc) => doc.movements).map((row) => row.quantity)),
        cash: sum(documents.flatMap((doc) => doc.payments).map((row) => row.amount)),
        agreed: sum(documents.flatMap((doc) => doc.agreements).map((row) => row.value)),
    }
}

export function stockOf(db: DB, productId: string): number {
    return dal
        .listDocuments(db)
        .flatMap((doc) => doc.movements)
        .filter((row) => row.productId === productId)
        .reduce((total, row) => total + row.quantity, 0)
}

/**
 * What a document still owes: everything agreed on it and on the documents linked
 * to it, less everything paid on any of them.
 *
 * The family, not the document alone: a void's rows hang off the document it takes
 * back, so a voided credit sale only comes out at zero if its void is counted with
 * it. The same formula answers both "how much is left to pay" and "did this cancel
 * out".
 */
export function owedOn(db: DB, documentId: string): number {
    const index = dal.LedgerIndex.loadLinkedTo(db, documentId)
    const family = [
        index.getDocument(documentId)!,
        ...index
            .linkedDocuments(documentId)
            .flatMap((doc) => [doc, ...index.linkedDocuments(doc.id)]),
    ]
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
    return (
        sum(family.flatMap((doc) => doc.agreements).map((row) => row.value)) -
        sum(family.flatMap((doc) => doc.payments).map((row) => row.amount))
    )
}

/**
 * The same input with one field taken out of it.
 *
 * A path reaches into a list where it needs to - `items.0.quantity` - because half
 * of what a command requires lives inside one. Used to check that leaving a field
 * out is an error rather than something the command fills in.
 */
export function without(input: object, path: string): object {
    const keys = path.split(".")
    const clone = structuredClone(input) as Record<string, unknown>

    let target = clone
    for (const key of keys.slice(0, -1)) {
        target = target[key] as Record<string, unknown>
    }
    delete target[keys[keys.length - 1]]

    return clone
}

/**
 * A pattern matching the field a message should name.
 */
export function names(path: string): RegExp {
    return new RegExp(path.replaceAll(".", "\\."))
}

/**
 * A stored document as the rules see it, before it was stored.
 */
export function asNew({ sequence: _sequence, ...document }: LedgerDocument): NewLedgerDocument {
    return document
}

/**
 * What a document refers to, loaded the way `post` loads it.
 */
export function contextFor(db: DB, document: NewLedgerDocument): bll.LedgerContext {
    return bll.loadContext(db, {
        performedBy: document.performedBy,
        productIds: [...document.agreements, ...document.movements].map((row) => row.productId),
        linkedDocumentId: document.linkedDocumentId,
    })
}
