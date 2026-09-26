/**
 * Unit test suite for the database client: the settings every connection gets,
 * and the transaction wrapper every write goes through.
 */

import { beforeEach, describe, expect, it } from "vitest"
import { inTransaction, listSalesmen, type DB } from "../../src/dal/index.js"
import { addProduct, addSalesman, freshDb } from "../fixtures.js"

let db: DB

beforeEach(() => {
    db = freshDb()
})

describe("createDb", () => {
    it("GIVEN a new connection THEN foreign keys are enforced rather than left to the driver's default", () => {
        expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1)
    })

    it("GIVEN a row naming something that does not exist WHEN written THEN the database refuses it", () => {
        expect(() => addProduct(db, "no-such-salesman")).toThrow(/FOREIGN KEY/i)
    })
})

describe("inTransaction", () => {
    it("GIVEN work that returns a value THEN the value comes back", () => {
        expect(inTransaction(db, () => 42)).toBe(42)
    })

    it("GIVEN work that throws THEN nothing it wrote is kept", () => {
        expect(() =>
            inTransaction(db, () => {
                addSalesman(db)
                throw new Error("stop")
            }),
        ).toThrow("stop")

        expect(listSalesmen(db)).toHaveLength(0)
    })

    it("GIVEN a nested write WHEN the outer transaction fails THEN the inner write is rolled back with it", () => {
        // addSalesman opens a transaction of its own, which has to become a
        // savepoint inside this one rather than a second transaction
        expect(() =>
            inTransaction(db, () => {
                addSalesman(db, { name: "First" })
                addSalesman(db, { name: "Second" })
                throw new Error("stop")
            }),
        ).toThrow("stop")

        expect(listSalesmen(db)).toHaveLength(0)
    })

    it("GIVEN a nested write that succeeds THEN both levels are committed", () => {
        inTransaction(db, () => {
            addSalesman(db, { name: "First" })
            addSalesman(db, { name: "Second" })
        })

        expect(
            listSalesmen(db)
                .map((salesman) => salesman.name)
                .sort(),
        ).toEqual(["First", "Second"])
    })
})
