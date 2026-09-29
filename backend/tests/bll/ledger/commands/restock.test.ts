/**
 * Unit test suite for the restock command: goods in, money out, both at entry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordRestock,
    updateProduct,
} from "../../../../src/bll/index.js"
import {
    listDocuments,
    type DB,
    type ProductRow,
    type SalesmanRow,
} from "../../../../src/dal/index.js"
import { AT, names, owedOn, setup, totals, without } from "../../fixtures.js"

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

describe("recordRestock", () => {
    it("GIVEN goods bought and paid for THEN stock arrives, money leaves, and no selling price is invented for them", () => {
        const restock = recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(restock).toMatchObject({ type: "RESTOCK", linkedDocumentId: null })
        expect(restock.agreements).toMatchObject([
            {
                productId: coke.id,
                quantity: 10,
                value: -3000,
                unitPrice: null,
                lineDiscount: null,
                documentDiscountShare: null,
            },
        ])
        expect(restock.movements).toMatchObject([{ productId: coke.id, quantity: 10 }])
        expect(restock.payments).toMatchObject([{ method: "Cash", amount: -3000 }])
        expect(totals(db)).toEqual({ stock: 10, cash: -3000, agreed: -3000 })
        expect(owedOn(db, restock.id)).toBe(0)
    })

    it("GIVEN the cost is what the units cost together THEN it is stored as one value, not per unit", () => {
        const restock = recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 4, totalCost: 1000 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })

        expect(restock.agreements[0].value).toBe(-1000)
    })

    it("GIVEN less paid than the goods cost THEN it is refused, and says how much is unsettled", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
                payments: [{ method: "Cash", amount: 1000 }],
            }),
        ).toThrow(/A RESTOCK settles exactly, but 2000 is unsettled/)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN more paid than the goods cost THEN it is refused: paying a supplier extra is an expense of its own", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
                payments: [{ method: "Cash", amount: 3500 }],
            }),
        ).toThrow(/A RESTOCK settles exactly, but 500 is over/)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN one line thrown in for free inside a purchase THEN it is allowed and costs nothing", () => {
        const water = createProduct(db, {
            name: "Water",
            sellPrice: 300,
            isActive: true,
            changedBy: boss.id,
        })

        const restock = recordRestock(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 10, totalCost: 3000 },
                { productId: water.id, quantity: 2, totalCost: 0 },
            ],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(restock.agreements.map((row) => row.value)).toEqual([-3000, 0])
        expect(totals(db).stock).toBe(12)
    })

    it("GIVEN a restock that cost nothing at all THEN it is refused, because goods arriving for free is a different kind of event", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 10, totalCost: 0 }],
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(/must be worth something/)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it: a free line has to say so with a cost of zero", () => {
        const valid = {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        }

        for (const path of [
            "performedBy",
            "items",
            "items.0.productId",
            "items.0.quantity",
            "items.0.totalCost",
            "payments",
            "payments.0.method",
            "payments.0.amount",
        ]) {
            expect(() => recordRestock(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordRestock(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const restock = recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(restock.occurredAt).toEqual(AT)
        expect(restock.notes).toBeNull()
    })

    it("GIVEN a cost that is negative or not whole cents THEN it is refused as bad input", () => {
        for (const totalCost of [-1, 1.5]) {
            expect(() =>
                recordRestock(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity: 1, totalCost }],
                    payments: [{ method: "Cash", amount: 100 }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN a quantity that is not a positive whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordRestock(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity, totalCost: 100 }],
                    payments: [{ method: "Cash", amount: 100 }],
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

        const badQuantity = () =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 10, totalCost: 3000 },
                    { productId: water.id, quantity: 1.5, totalCost: 100 },
                ],
                payments: [{ method: "Cash", amount: 3100 }],
            })

        expect(badQuantity).toThrow(InvalidInputError)
        expect(badQuantity).toThrow(names("items.1.quantity"))

        const badCost = () =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 10, totalCost: 3000 },
                    { productId: water.id, quantity: 2, totalCost: -1 },
                ],
                payments: [{ method: "Cash", amount: 3000 }],
            })

        expect(badCost).toThrow(InvalidInputError)
        expect(badCost).toThrow(names("items.1.totalCost"))
    })

    it("GIVEN a product that is inactive THEN buying more of it is refused", () => {
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN a product that does not exist THEN it is refused", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1, totalCost: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(NotFoundError)
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1, totalCost: 100 },
                    { productId: coke.id, quantity: 2, totalCost: 200 },
                ],
                payments: [{ method: "Cash", amount: 300 }],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN a discount passed in anyway THEN it is refused rather than quietly dropped: what a purchase cost is what was paid for it", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
                documentDiscount: 10,
            } as never),
        ).toThrow(/Unrecognized key: "documentDiscount"/)
    })

    it("GIVEN a field the command does not accept inside an item THEN it is refused the same way, naming the line", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 2, totalCost: 200, unitCost: 100 }],
                payments: [{ method: "Cash", amount: 200 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "unitCost"/)
    })

    it("GIVEN no payment at all THEN it is refused as bad input, since a restock is paid at entry", () => {
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
                payments: [],
            }),
        ).toThrow(/payments: At least one payment is required/)
    })
})
