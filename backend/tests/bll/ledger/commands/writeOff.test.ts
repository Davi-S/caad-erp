/**
 * Unit test suite for the write-off command: goods out with nobody on the other
 * side.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordRestock,
    recordWriteOff,
    updateProduct,
} from "../../../../src/bll/index.js"
import type { DB, ProductRow, SalesmanRow } from "../../../../src/dal/index.js"
import { AT, names, setup, stockOf, totals, without } from "../../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = createProduct(db, { name: "Coke", sellPrice: 500, isActive: true, changedBy: boss.id })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("recordWriteOff", () => {
    it("GIVEN units lost THEN only the goods leaving is recorded: nothing was agreed and no money moved", () => {
        recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        const writeOff = recordWriteOff(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })

        expect(writeOff).toMatchObject({ type: "WRITE_OFF", linkedDocumentId: null })
        expect(writeOff.agreements).toEqual([])
        expect(writeOff.payments).toEqual([])
        expect(writeOff.movements).toMatchObject([{ productId: coke.id, quantity: -3 }])
        expect(totals(db)).toEqual({ stock: 7, cash: -3000, agreed: -3000 })
    })

    it("GIVEN a product that is inactive THEN its remaining stock can still be cleared", () => {
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        const writeOff = recordWriteOff(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(writeOff.movements).toHaveLength(1)
    })

    it("GIVEN a product that does not exist THEN it is refused: something has to have left the shelf", () => {
        expect(() =>
            recordWriteOff(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1 }],
            }),
        ).toThrow(NotFoundError)
    })

    it("GIVEN more units than the shelf holds THEN it is allowed, and stock is left negative to be reported", () => {
        recordWriteOff(db, { performedBy: boss.id, items: [{ productId: coke.id, quantity: 4 }] })

        expect(stockOf(db, coke.id)).toBe(-4)
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN the write-off is refused", () => {
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() =>
            recordWriteOff(db, {
                performedBy: "nobody",
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(NotFoundError)
        expect(() =>
            recordWriteOff(db, {
                performedBy: inactive.id,
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = { performedBy: boss.id, items: [{ productId: coke.id, quantity: 3 }] }

        for (const path of ["performedBy", "items", "items.0.productId", "items.0.quantity"]) {
            expect(() => recordWriteOff(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordWriteOff(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const writeOff = recordWriteOff(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(writeOff.occurredAt).toEqual(AT)
        expect(writeOff.notes).toBeNull()
    })

    it("GIVEN a quantity that is not a positive whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordWriteOff(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN one bad line among valid ones THEN it is refused, naming the line: a valid first line does not vouch for the rest", () => {
        const water = createProduct(db, {
            name: "Water",
            sellPrice: 300,
            isActive: true,
            changedBy: boss.id,
        })

        for (const quantity of [0, -1, 1.5]) {
            const attempt = () =>
                recordWriteOff(db, {
                    performedBy: boss.id,
                    items: [
                        { productId: coke.id, quantity: 1 },
                        { productId: water.id, quantity },
                    ],
                })

            expect(attempt, String(quantity)).toThrow(InvalidInputError)
            expect(attempt, String(quantity)).toThrow(names("items.1.quantity"))
        }
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordWriteOff(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: coke.id, quantity: 1 },
                ],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })
})
