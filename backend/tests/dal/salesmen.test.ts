/**
 * Unit test suite for the `salesmen` table and the change trail storage keeps for
 * it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    getSalesman,
    insertSalesman,
    listSalesmen,
    listSalesmanHistory,
    updateSalesman,
    type DB,
} from "../../src/dal/index.js"
import { newId } from "../../src/ids.js"
import { addSalesman, AT, freshDb } from "../fixtures.js"

let db: DB

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    db = freshDb()
})

afterEach(() => {
    vi.useRealTimers()
})

describe("insertSalesman", () => {
    it("GIVEN the very first salesman, who has nobody else to be recorded against THEN the snapshot names them as their own author", () => {
        const id = newId()

        const boss = insertSalesman(db, { id, name: "Boss", isActive: true }, id)

        expect(getSalesman(db, id)).toEqual(boss)
        expect(listSalesmanHistory(db, id)).toEqual([
            {
                id: expect.any(String),
                sequence: 1,
                salesmanId: id,
                changedBy: id,
                recordedAt: AT,
                name: "Boss",
                isActive: true,
            },
        ])
    })
})

describe("updateSalesman", () => {
    it("GIVEN a salesman being deactivated THEN the row changes and the snapshot records who did it", () => {
        const boss = addSalesman(db)
        const helper = addSalesman(db, { name: "Helper" })

        const updated = updateSalesman(db, helper.id, { isActive: false }, boss.id)!

        expect(updated).toEqual({ ...helper, isActive: false })
        expect(
            listSalesmanHistory(db, helper.id).map((row) => [row.isActive, row.changedBy]),
        ).toEqual([
            [true, helper.id],
            [false, boss.id],
        ])
    })

    it("GIVEN a write that changes nothing THEN it is still recorded, because storage records writes and not differences", () => {
        const boss = addSalesman(db)

        updateSalesman(db, boss.id, { name: "Boss" }, boss.id)

        expect(listSalesmanHistory(db, boss.id)).toHaveLength(2)
    })

    it("GIVEN an id that is not stored THEN there is nothing to return and nothing is recorded", () => {
        const boss = addSalesman(db)

        expect(updateSalesman(db, "nope", { name: "Ghost" }, boss.id)).toBeUndefined()
        expect(listSalesmanHistory(db, "nope")).toEqual([])
    })

    it("GIVEN a different salesman making the change THEN the snapshot names them, not the salesman it is about", () => {
        const boss = addSalesman(db)
        const helper = addSalesman(db, { name: "Helper" })

        updateSalesman(db, helper.id, { isActive: false }, boss.id)

        expect(listSalesmanHistory(db, helper.id).map((row) => row.changedBy)).toEqual([
            helper.id,
            boss.id,
        ])
    })
})

describe("listSalesmanHistory", () => {
    it("GIVEN several salesmen THEN each one's history is its own, and the sequence counts every change there is", () => {
        const boss = addSalesman(db)
        const helper = addSalesman(db, { name: "Helper" })
        updateSalesman(db, boss.id, { name: "Chief" }, boss.id)

        expect(listSalesmen(db)).toHaveLength(2)
        expect(listSalesmanHistory(db, boss.id).map((row) => row.sequence)).toEqual([1, 3])
        expect(listSalesmanHistory(db, helper.id).map((row) => row.sequence)).toEqual([2])
    })
})
