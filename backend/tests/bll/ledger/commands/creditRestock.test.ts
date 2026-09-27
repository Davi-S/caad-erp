/**
 * Unit test suite for the credit restock command: goods in now, money later.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordCreditRestock,
    recordPaymentOut,
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
let water: ProductRow

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = createProduct(db, { name: "Coke", sellPrice: 500, isActive: true, changedBy: boss.id })
    water = createProduct(db, { name: "Water", sellPrice: 300, isActive: true, changedBy: boss.id })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("recordCreditRestock", () => {
    it("GIVEN goods taken on credit THEN stock arrives and the cost is owed, with no money moving", () => {
        const restock = recordCreditRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
        })

        expect(restock).toMatchObject({ type: "CREDIT_RESTOCK", linkedDocumentId: null })
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
        expect(restock.payments).toEqual([])
        // The goods are here and the money is not: owed by us, so negative
        expect(totals(db)).toEqual({ stock: 10, cash: 0, agreed: -3000 })
        expect(owedOn(db, restock.id)).toBe(-3000)
    })

    it("GIVEN the supplier is paid afterwards THEN the debt falls to nothing", () => {
        const restock = recordCreditRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
        })

        recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: restock.id,
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(owedOn(db, restock.id)).toBe(0)
        expect(totals(db)).toEqual({ stock: 10, cash: -3000, agreed: -3000 })
    })

    it("GIVEN the cost is what the units cost together THEN it is stored as one value, not per unit", () => {
        const restock = recordCreditRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 4, totalCost: 1000 }],
        })

        expect(restock.agreements[0].value).toBe(-1000)
    })

    it("GIVEN one line thrown in for free inside a purchase THEN it is allowed and costs nothing", () => {
        const restock = recordCreditRestock(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 10, totalCost: 3000 },
                { productId: water.id, quantity: 2, totalCost: 0 },
            ],
        })

        expect(restock.agreements.map((row) => row.value)).toEqual([-3000, 0])
        expect(totals(db).stock).toBe(12)
    })

    it("GIVEN a delivery that cost nothing at all THEN it is refused, because goods arriving for free is a different kind of event", () => {
        expect(() =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 10, totalCost: 0 }],
            }),
        ).toThrow(/must be worth something/)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
        }

        for (const path of [
            "performedBy",
            "items",
            "items.0.productId",
            "items.0.quantity",
            "items.0.totalCost",
        ]) {
            expect(() => recordCreditRestock(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordCreditRestock(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const restock = recordCreditRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
        })

        expect(restock.occurredAt).toEqual(AT)
        expect(restock.notes).toBeNull()
    })

    it("GIVEN a cost that is negative or not whole cents THEN it is refused as bad input", () => {
        for (const totalCost of [-1, 1.5]) {
            expect(() =>
                recordCreditRestock(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity: 1, totalCost }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN a quantity that is not a positive whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordCreditRestock(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity, totalCost: 100 }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN one bad line among valid ones THEN it is refused, naming the line: a valid first line does not vouch for the rest", () => {
        const badQuantity = () =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 10, totalCost: 3000 },
                    { productId: water.id, quantity: 1.5, totalCost: 100 },
                ],
            })

        expect(badQuantity).toThrow(InvalidInputError)
        expect(badQuantity).toThrow(names("items.1.quantity"))

        const badCost = () =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 10, totalCost: 3000 },
                    { productId: water.id, quantity: 2, totalCost: -1 },
                ],
            })

        expect(badCost).toThrow(InvalidInputError)
        expect(badCost).toThrow(names("items.1.totalCost"))
    })

    it("GIVEN a product that does not exist, or is inactive THEN taking more of it on credit is refused", () => {
        expect(() =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1, totalCost: 100 }],
            }),
        ).toThrow(NotFoundError)

        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })
        expect(() =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1, totalCost: 100 },
                    { productId: coke.id, quantity: 2, totalCost: 200 },
                ],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN payments passed in anyway THEN it is refused rather than quietly dropped: settling a credit restock is its own document", () => {
        expect(() =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
            } as never),
        ).toThrow(/Unrecognized key: "payments"/)
    })

    it("GIVEN a field the command does not accept inside an item THEN it is refused the same way, naming the line", () => {
        expect(() =>
            recordCreditRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 2, totalCost: 200, unitCost: 100 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "unitCost"/)
    })
})
