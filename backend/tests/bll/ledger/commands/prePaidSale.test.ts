/**
 * Unit test suite for the pre-paid sale command: money in now, goods later.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordDeliveryOut,
    recordPrePaidSale,
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

describe("recordPrePaidSale", () => {
    it("GIVEN goods paid for up front THEN the deal and the money are recorded, and no goods move yet", () => {
        const sale = recordPrePaidSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 3 }],
            payments: [{ method: "Cash", amount: 1500 }],
        })

        expect(sale).toMatchObject({ type: "PRE_PAID_SALE", linkedDocumentId: null })
        expect(sale.agreements).toMatchObject([
            { productId: coke.id, quantity: -3, unitPrice: 500, value: 1500 },
        ])
        expect(sale.movements).toEqual([])
        expect(sale.payments).toMatchObject([{ method: "Cash", amount: 1500 }])
        // Paid for, so nothing is owed; but the stock is still on the shelf
        expect(owedOn(db, sale.id)).toBe(0)
        expect(totals(db)).toEqual({ stock: 0, cash: 1500, agreed: 1500 })
    })

    it("GIVEN the catalog price changes afterwards THEN what was agreed is unchanged", () => {
        const sale = recordPrePaidSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })

        updateProduct(db, coke.id, { sellPrice: 700, changedBy: boss.id })

        expect(sale.agreements[0]).toMatchObject({ unitPrice: 500, value: 1000 })
    })

    it("GIVEN discounts THEN what is paid is what was agreed after them, priced exactly as a counter sale is", () => {
        const sale = recordPrePaidSale(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 2, lineDiscount: 100 },
                { productId: water.id, quantity: 1 },
            ],
            documentDiscount: 100,
            payments: [{ method: "Cash", amount: 1100 }],
        })

        // 900 and 300 of a 1200 cart: 75 and 25 of the 100 given away
        expect(sale.agreements.map((row) => row.value)).toEqual([825, 275])
        expect(owedOn(db, sale.id)).toBe(0)
    })

    it("GIVEN less paid than the goods are worth THEN it is refused: pre-paid means paid now", () => {
        expect(() =>
            recordPrePaidSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 2 }],
                payments: [{ method: "Cash", amount: 600 }],
            }),
        ).toThrow(/A PRE_PAID_SALE settles exactly, but 400 is unsettled/)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN more paid than the goods are worth THEN it is refused: a tip is a document of its own", () => {
        expect(() =>
            recordPrePaidSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 600 }],
            }),
        ).toThrow(/A PRE_PAID_SALE settles exactly, but 100 is over/)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN a cart that is entirely free THEN it is refused, exactly as a counter sale would be", () => {
        expect(() =>
            recordPrePaidSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, lineDiscount: 500 }],
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(/must be worth something/)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        }

        for (const path of [
            "performedBy",
            "items",
            "items.0.productId",
            "items.0.quantity",
            "payments",
            "payments.0.method",
            "payments.0.amount",
        ]) {
            expect(() => recordPrePaidSale(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordPrePaidSale(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today, no note and no discount", () => {
        const sale = recordPrePaidSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(sale.occurredAt).toEqual(AT)
        expect(sale.notes).toBeNull()
        expect(sale.agreements[0]).toMatchObject({ lineDiscount: 0, documentDiscountShare: 0 })
    })

    it("GIVEN a quantity that is not a positive whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordPrePaidSale(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity }],
                    payments: [{ method: "Cash", amount: 500 }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN a product that does not exist, or is inactive THEN it is refused: nothing is sold that is not for sale", () => {
        expect(() =>
            recordPrePaidSale(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(NotFoundError)

        updateProduct(db, water.id, { isActive: false, changedBy: boss.id })
        expect(() =>
            recordPrePaidSale(db, {
                performedBy: boss.id,
                items: [{ productId: water.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 300 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordPrePaidSale(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: coke.id, quantity: 2 },
                ],
                payments: [{ method: "Cash", amount: 1500 }],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN a field the command does not accept inside an item THEN it is refused the same way, naming the line", () => {
        expect(() =>
            recordPrePaidSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, unitPrice: 100 }],
                payments: [{ method: "Cash", amount: 500 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "unitPrice"/)
    })

    it("GIVEN goods collected later THEN the sale is what agreed them, and the stock falls only then", () => {
        const sale = recordPrePaidSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })

        expect(totals(db).stock).toBe(0)

        recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 2 }],
        })

        expect(totals(db).stock).toBe(-2)
    })
})
