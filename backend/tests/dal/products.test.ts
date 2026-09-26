/**
 * Unit test suite for the `products` table and the change trail storage keeps for
 * it.
 *
 * The trail is the DAL's own doing: a caller cannot write a product without
 * leaving a snapshot behind.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    getProduct,
    listProductHistory,
    listProducts,
    updateProduct,
    type DB,
    type SalesmanRow,
} from "../../src/dal/index.js"
import { addProduct, addSalesman, AT, freshDb } from "../fixtures.js"

let db: DB
let boss: SalesmanRow

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    db = freshDb()
    boss = addSalesman(db)
})

afterEach(() => {
    vi.useRealTimers()
})

describe("insertProduct", () => {
    it("GIVEN a new product THEN the row is stored and its first snapshot records the state and who made it", () => {
        const coke = addProduct(db, boss.id, { name: "Coke", sellPrice: 500 })

        expect(getProduct(db, coke.id)).toEqual(coke)
        expect(listProductHistory(db, coke.id)).toEqual([
            {
                id: expect.any(String),
                sequence: 1,
                productId: coke.id,
                changedBy: boss.id,
                recordedAt: AT,
                name: "Coke",
                sellPrice: 500,
                isActive: true,
            },
        ])
    })
})

describe("updateProduct", () => {
    it("GIVEN some of the fields THEN only those change, and the snapshot holds the state the write left behind", () => {
        const coke = addProduct(db, boss.id, { name: "Coke", sellPrice: 500 })

        const updated = updateProduct(db, coke.id, { sellPrice: 600 }, boss.id)!

        expect(updated).toEqual({ ...coke, sellPrice: 600 })
        expect(listProductHistory(db, coke.id).map((row) => [row.sequence, row.sellPrice])).toEqual(
            [
                [1, 500],
                [2, 600],
            ],
        )
    })

    it("GIVEN a write that changes nothing THEN it is still recorded, because storage records writes and not differences", () => {
        const coke = addProduct(db, boss.id, { sellPrice: 500 })

        updateProduct(db, coke.id, { sellPrice: 500 }, boss.id)

        expect(listProductHistory(db, coke.id)).toHaveLength(2)
    })

    it("GIVEN an id that is not stored THEN there is nothing to return and nothing is recorded", () => {
        expect(updateProduct(db, "nope", { sellPrice: 600 }, boss.id)).toBeUndefined()
        expect(listProductHistory(db, "nope")).toEqual([])
    })

    it("GIVEN a different salesman making the change THEN the snapshot names them, not the product's author", () => {
        const coke = addProduct(db, boss.id)
        const helper = addSalesman(db, { name: "Helper" })

        updateProduct(db, coke.id, { isActive: false }, helper.id)

        expect(listProductHistory(db, coke.id).map((row) => row.changedBy)).toEqual([
            boss.id,
            helper.id,
        ])
    })
})

describe("listProductHistory", () => {
    it("GIVEN several products THEN each one's history is its own, and the sequence counts every change there is", () => {
        const coke = addProduct(db, boss.id, { name: "Coke" })
        const water = addProduct(db, boss.id, { name: "Water" })
        updateProduct(db, coke.id, { sellPrice: 600 }, boss.id)

        expect(listProducts(db)).toHaveLength(2)
        expect(listProductHistory(db, coke.id).map((row) => row.sequence)).toEqual([1, 3])
        expect(listProductHistory(db, water.id).map((row) => row.sequence)).toEqual([2])
    })
})
