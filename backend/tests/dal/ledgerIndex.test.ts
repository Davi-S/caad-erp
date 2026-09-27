/**
 * Unit test suite for `LedgerIndex`: navigating a slice of the ledger in memory.
 *
 * It only knows how documents point at each other. What a link means is the BLL's,
 * and is tested there.
 */

import { beforeEach, describe, expect, it } from "vitest"
import { insertDocument, LedgerIndex, type DB, type SalesmanRow } from "../../src/dal/index.js"
import { newId } from "../../src/ids.js"
import { addSalesman, documentRecord, freshDb } from "../fixtures.js"

let db: DB
let boss: SalesmanRow

beforeEach(() => {
    db = freshDb()
    boss = addSalesman(db)
})

function insert(linkedDocumentId: string | null = null): string {
    const record = documentRecord(newId(), boss.id, { linkedDocumentId })
    insertDocument(db, record)
    return record.id
}

describe("LedgerIndex.loadLinkedTo", () => {
    it("GIVEN a document with dependents THEN it is found, and what points at it is listed under it", () => {
        const target = insert()
        const first = insert(target)
        const second = insert(target)
        insert() // unrelated

        const index = LedgerIndex.loadLinkedTo(db, target)

        expect(index.getDocument(target)?.id).toBe(target)
        expect(
            index
                .linkedDocuments(target)
                .map((doc) => doc.id)
                .sort(),
        ).toEqual([first, second].sort())
    })

    it("GIVEN a dependent of a dependent THEN it is in the index, listed under its own parent", () => {
        const target = insert()
        const dependent = insert(target)
        const dependentOfDependent = insert(dependent)

        const index = LedgerIndex.loadLinkedTo(db, target)

        expect(index.getDocument(dependentOfDependent)?.id).toBe(dependentOfDependent)
        expect(index.linkedDocuments(dependent).map((doc) => doc.id)).toEqual([
            dependentOfDependent,
        ])
        expect(index.linkedDocuments(dependentOfDependent)).toEqual([])
    })

    it("GIVEN a document that is not stored THEN the index is empty rather than absent", () => {
        const index = LedgerIndex.loadLinkedTo(db, "nope")

        expect(index.getDocument("nope")).toBeUndefined()
        expect(index.linkedDocuments("nope")).toEqual([])
    })

    it("GIVEN an unrelated document THEN it is left out, so a rule only ever sees the slice it asked for", () => {
        const target = insert()
        const unrelated = insert()

        const index = LedgerIndex.loadLinkedTo(db, target)

        expect(index.getDocument(unrelated)).toBeUndefined()
    })
})

describe("LedgerIndex.descendants", () => {
    it("GIVEN documents hanging off each other THEN every one below is listed, however deep, and the document itself is not", () => {
        const target = insert()
        const child = insert(target)
        const grandchild = insert(child)
        const sibling = insert(target)
        insert() // unrelated

        const index = LedgerIndex.loadLinkedTo(db, target)

        expect(
            index
                .descendants(target)
                .map((doc) => doc.id)
                .sort(),
        ).toEqual([child, grandchild, sibling].sort())
        expect(index.descendants(child).map((doc) => doc.id)).toEqual([grandchild])
        expect(index.descendants(grandchild)).toEqual([])
    })
})

describe("new LedgerIndex()", () => {
    it("GIVEN a document that links to nothing, so nothing was loaded THEN the index finds nothing", () => {
        const index = new LedgerIndex()

        expect(index.getDocument("anything")).toBeUndefined()
        expect(index.linkedDocuments("anything")).toEqual([])
    })
})
