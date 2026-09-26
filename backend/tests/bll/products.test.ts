/**
 * Unit test suite for the product catalog commands.
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    createProduct,
    createSalesman,
    getProduct,
    getProductHistory,
    InactiveError,
    InvalidInputError,
    listProducts,
    NotFoundError,
    requireActiveProduct,
    updateProduct,
} from "../../src/bll/index.js"
import type { DB, SalesmanRow } from "../../src/dal/index.js"
import { names, product, setup, without } from "./fixtures.js"

let db: DB
let boss: SalesmanRow

beforeEach(() => {
    ;({ db, boss } = setup())
})

describe("createProduct", () => {
    it("GIVEN every field THEN the product is stored as given, with its name trimmed", () => {
        const coke = createProduct(db, {
            name: "  Coke  ",
            sellPrice: 500,
            isActive: true,
            changedBy: boss.id,
        })

        expect(coke).toMatchObject({ name: "Coke", sellPrice: 500, isActive: true })
        expect(getProduct(db, coke.id)).toEqual(coke)
    })

    it("GIVEN any missing field THEN it is refused, naming it: creation has no defaults to fall back on", () => {
        const valid = { name: "Coke", sellPrice: 500, isActive: true, changedBy: boss.id }

        for (const path of ["name", "sellPrice", "isActive", "changedBy"]) {
            expect(() => createProduct(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => createProduct(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }

        expect(listProducts(db)).toHaveLength(0)
    })

    it("GIVEN a blank name THEN it is refused", () => {
        expect(() => product(db, boss.id, { name: "   " })).toThrow(/name: Name is required/)
    })

    it("GIVEN a price of nothing THEN it is allowed, because a free product is a real thing", () => {
        expect(product(db, boss.id, { sellPrice: 0 }).sellPrice).toBe(0)
    })

    it("GIVEN a price that is negative or not whole cents THEN it is refused", () => {
        expect(() => product(db, boss.id, { sellPrice: -1 })).toThrow(/Price cannot be negative/)
        expect(() => product(db, boss.id, { sellPrice: 1.5 })).toThrow(
            /Price must be an integer amount in cents/,
        )
    })

    it("GIVEN a product that is already inactive THEN it can still be created, so goods that are not for sale still have a catalog entry", () => {
        expect(product(db, boss.id, { isActive: false }).isActive).toBe(false)
    })

    it("GIVEN an author who does not exist THEN nothing is created, and the error says which record is missing", () => {
        expect(() => product(db, "nobody")).toThrow(NotFoundError)
        expect(listProducts(db)).toHaveLength(0)
    })

    it("GIVEN a field the command does not accept THEN it is refused rather than dropped", () => {
        expect(() =>
            createProduct(db, {
                name: "Coke",
                sellPrice: 500,
                isActive: true,
                changedBy: boss.id,
                costPrice: 300,
            } as never),
        ).toThrow(/Unrecognized key: "costPrice"/)
    })

    it("GIVEN an author who is inactive THEN nothing is created: a change has to be attributable to an active salesman", () => {
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() => product(db, inactive.id)).toThrow(InactiveError)
        expect(listProducts(db)).toHaveLength(0)
    })
})

describe("updateProduct", () => {
    it("GIVEN no author THEN it is refused: every change is attributed, even a partial one", () => {
        const coke = product(db, boss.id)

        expect(() => updateProduct(db, coke.id, { sellPrice: 600 } as never)).toThrow(
            /changedBy: The salesman making the change is required/,
        )
    })

    it("GIVEN one field THEN only that field changes", () => {
        const coke = product(db, boss.id, { name: "Coke", sellPrice: 500 })

        const updated = updateProduct(db, coke.id, { sellPrice: 600, changedBy: boss.id })

        expect(updated).toEqual({ ...coke, sellPrice: 600 })
    })

    it("GIVEN only an author and nothing to change THEN it is refused", () => {
        const coke = product(db, boss.id)

        expect(() => updateProduct(db, coke.id, { changedBy: boss.id })).toThrow(InvalidInputError)
        expect(() => updateProduct(db, coke.id, { changedBy: boss.id })).toThrow(
            /No fields to update/,
        )
    })

    it("GIVEN a product that does not exist THEN it is reported as missing", () => {
        expect(() => updateProduct(db, "nope", { sellPrice: 1, changedBy: boss.id })).toThrow(
            NotFoundError,
        )
    })

    it("GIVEN a field the command does not accept THEN it is refused rather than dropped", () => {
        const coke = product(db, boss.id)

        expect(() =>
            updateProduct(db, coke.id, { costPrice: 300, changedBy: boss.id } as never),
        ).toThrow(/Unrecognized key: "costPrice"/)
    })

    it("GIVEN an author who is inactive THEN the change is refused and the product is untouched", () => {
        const coke = product(db, boss.id, { sellPrice: 500 })
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() =>
            updateProduct(db, coke.id, { sellPrice: 600, changedBy: inactive.id }),
        ).toThrow(InactiveError)
        expect(getProduct(db, coke.id).sellPrice).toBe(500)
        expect(getProductHistory(db, coke.id)).toHaveLength(1)
    })
})

describe("getProduct", () => {
    it("GIVEN a product that does not exist THEN it is reported as missing rather than returned empty", () => {
        expect(() => getProduct(db, "nope")).toThrow(NotFoundError)
    })
})

describe("requireActiveProduct", () => {
    it("GIVEN a product that is inactive THEN it is refused for anything that records something new", () => {
        const coke = product(db, boss.id, { isActive: false })

        expect(() => requireActiveProduct(db, coke.id)).toThrow(InactiveError)
    })

    it("GIVEN a product that is active THEN it comes back", () => {
        const coke = product(db, boss.id)

        expect(requireActiveProduct(db, coke.id)).toEqual(coke)
    })

    it("GIVEN a product that does not exist THEN it is reported as missing", () => {
        expect(() => requireActiveProduct(db, "nope")).toThrow(NotFoundError)
    })
})

describe("getProductHistory", () => {
    it("GIVEN a product that changed THEN every state it was left in comes back, oldest first", () => {
        const coke = product(db, boss.id, { sellPrice: 500 })
        updateProduct(db, coke.id, { sellPrice: 600, changedBy: boss.id })

        expect(getProductHistory(db, coke.id).map((row) => row.sellPrice)).toEqual([500, 600])
    })

    it("GIVEN a product that does not exist THEN it is reported as missing rather than returned empty", () => {
        expect(() => getProductHistory(db, "nope")).toThrow(NotFoundError)
    })
})
