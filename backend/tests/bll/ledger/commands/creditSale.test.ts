/**
 * Unit test suite for the credit sale command: goods out now, money later.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    InactiveError,
    NotFoundError,
    recordCreditSale,
    updateProduct,
} from "../../../../src/bll/index.js"
import {
    getDocument,
    type DB,
    type ProductRow,
    type SalesmanRow,
} from "../../../../src/dal/index.js"
import { AT, owedOn, product, setup, totals } from "../../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = product(db, boss.id, { name: "Coke", sellPrice: 500 })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("recordCreditSale", () => {
    it("GIVEN goods handed over to be paid for later THEN the deal and the goods are recorded, and no money is", () => {
        const sale = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })

        expect(sale).toMatchObject({ type: "CREDIT_SALE", linkedDocumentId: null })
        expect(sale.agreements).toMatchObject([
            { productId: coke.id, quantity: -3, unitPrice: 500, value: 1500 },
        ])
        expect(sale.movements).toMatchObject([{ productId: coke.id, quantity: -3 }])
        expect(sale.payments).toEqual([])
        expect(totals(db)).toEqual({ stock: -3, cash: 0, agreed: 1500 })
    })

    it("GIVEN nothing has been paid THEN the whole value is owed, and the sale is valid all the same", () => {
        const sale = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })

        expect(owedOn(db, sale.id)).toBe(1500)
    })

    it("GIVEN the catalog price changes afterwards THEN the debt does not move with it", () => {
        const sale = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
        })

        updateProduct(db, coke.id, { sellPrice: 900, changedBy: boss.id })

        expect(getDocument(db, sale.id)!.agreements[0].value).toBe(1000)
        expect(owedOn(db, sale.id)).toBe(1000)
    })

    it("GIVEN discounts THEN the debt is what was agreed after them, not the catalog total", () => {
        const water = product(db, boss.id, { name: "Water", sellPrice: 300 })

        const sale = recordCreditSale(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 2, lineDiscount: 100 },
                { productId: water.id, quantity: 1 },
            ],
            documentDiscount: 100,
        })

        // 900 and 300 of a 1200 cart: 75 and 25 of the 100 given away
        expect(sale.agreements.map((row) => row.value)).toEqual([825, 275])
        expect(owedOn(db, sale.id)).toBe(1100)
    })

    it("GIVEN a cart that is entirely free THEN it is refused, exactly as a counter sale would be", () => {
        expect(() =>
            recordCreditSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, lineDiscount: 500 }],
            }),
        ).toThrow(/must be worth something/)
    })

    it("GIVEN payments passed in anyway THEN it is refused rather than quietly dropped: settling a credit sale is its own document", () => {
        expect(() =>
            recordCreditSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            } as never),
        ).toThrow(/Unrecognized key: "payments"/)
    })

    it("GIVEN a product or salesman that cannot take part THEN the sale is refused", () => {
        const water = product(db, boss.id, { name: "Water", sellPrice: 300, isActive: false })

        expect(() =>
            recordCreditSale(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1 }],
            }),
        ).toThrow(NotFoundError)
        expect(() =>
            recordCreditSale(db, {
                performedBy: boss.id,
                items: [{ productId: water.id, quantity: 1 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordCreditSale(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: coke.id, quantity: 1 },
                ],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })
})
