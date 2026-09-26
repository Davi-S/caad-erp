/**
 * Unit test suite for ledger storage: documents with their agreements, movements
 * and payments.
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    getDocument,
    insertDocument,
    listDocuments,
    listLinkedDocuments,
    type DB,
    type ProductRow,
    type SalesmanRow,
} from "../../src/dal/index.js"
import { newId } from "../../src/ids.js"
import {
    addProduct,
    addSalesman,
    agreementRow,
    AT,
    documentRecord,
    movementRow,
    paymentRow,
    freshDb,
} from "../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow

beforeEach(() => {
    db = freshDb()
    boss = addSalesman(db)
    coke = addProduct(db, boss.id)
})

/** A document of every row kind, so nothing is left untested by omission. */
function fullDocument(): ReturnType<typeof documentRecord> {
    const id = newId()
    return documentRecord(id, boss.id, {
        agreements: [agreementRow(id, coke.id, { quantity: -2, value: 1000 })],
        movements: [movementRow(id, coke.id, { quantity: -2 })],
        payments: [paymentRow(id, { amount: 1000 })],
    })
}

describe("insertDocument", () => {
    it("GIVEN a document with all three row kinds WHEN inserted THEN it is stored with its rows and the first sequence number", () => {
        const record = fullDocument()

        const stored = insertDocument(db, record)

        expect(stored.sequence).toBe(1)
        expect(stored.agreements).toEqual(record.agreements)
        expect(stored.movements).toEqual(record.movements)
        expect(stored.payments).toEqual(record.payments)
        expect(getDocument(db, record.id)).toEqual(stored)
    })

    it("GIVEN a stored document THEN its timestamps come back as dates and are kept as whole milliseconds", () => {
        const record = fullDocument()

        insertDocument(db, record)

        const stored = getDocument(db, record.id)!
        expect(stored.occurredAt).toEqual(AT)
        expect(stored.recordedAt).toEqual(AT)
        expect(stored.notes).toBeNull()

        const raw = db.$client
            .prepare<[], { occurred_at: unknown }>("SELECT occurred_at FROM documents")
            .get()!
        expect(raw.occurred_at).toBe(AT.getTime())
    })

    it("GIVEN documents inserted one after another THEN each takes the next sequence number", () => {
        const sequences = [fullDocument(), fullDocument(), fullDocument()].map(
            (record) => insertDocument(db, record).sequence,
        )

        expect(sequences).toEqual([1, 2, 3])
    })

    it("GIVEN a row that names something unknown THEN the whole document is refused and nothing is written", () => {
        const id = newId()
        const record = documentRecord(id, boss.id, {
            agreements: [agreementRow(id, coke.id)],
            movements: [movementRow(id, "no-such-product")],
        })

        expect(() => insertDocument(db, record)).toThrow(/FOREIGN KEY/i)
        expect(listDocuments(db)).toHaveLength(0)
    })
})

describe("getDocument", () => {
    it("GIVEN an id that is not stored THEN there is nothing to return", () => {
        expect(getDocument(db, "nope")).toBeUndefined()
    })

    it("GIVEN two documents with rows THEN each one comes back with only its own", () => {
        const first = fullDocument()
        const second = fullDocument()
        insertDocument(db, first)
        insertDocument(db, second)

        const stored = getDocument(db, first.id)!

        expect(stored.agreements).toEqual(first.agreements)
        expect(stored.movements).toEqual(first.movements)
        expect(stored.payments).toEqual(first.payments)
    })
})

describe("listDocuments", () => {
    it("GIVEN a document entered late for an earlier day THEN documents come back in the order they were entered", () => {
        const earlier = documentRecord(newId(), boss.id, {
            occurredAt: new Date(AT.getTime() - 86_400_000),
        })
        const later = documentRecord(newId(), boss.id)

        insertDocument(db, later)
        insertDocument(db, earlier)

        expect(listDocuments(db).map((doc) => doc.id)).toEqual([later.id, earlier.id])
    })
})

describe("listLinkedDocuments", () => {
    it("GIVEN a chain of links THEN the document and everything linking to it come back, directly or not", () => {
        const target = documentRecord(newId(), boss.id)
        const dependent = documentRecord(newId(), boss.id, { linkedDocumentId: target.id })
        const dependentOfDependent = documentRecord(newId(), boss.id, {
            linkedDocumentId: dependent.id,
        })
        const unrelated = documentRecord(newId(), boss.id)
        for (const record of [target, dependent, dependentOfDependent, unrelated]) {
            insertDocument(db, record)
        }

        const linked = listLinkedDocuments(db, target.id).map((doc) => doc.id)

        expect(linked).toEqual([target.id, dependent.id, dependentOfDependent.id])
    })

    it("GIVEN a document nothing links to THEN only the document itself comes back", () => {
        const alone = documentRecord(newId(), boss.id)
        insertDocument(db, alone)

        expect(listLinkedDocuments(db, alone.id).map((doc) => doc.id)).toEqual([alone.id])
    })

    it("GIVEN an id that is not stored THEN nothing comes back", () => {
        expect(listLinkedDocuments(db, "nope")).toEqual([])
    })
})
