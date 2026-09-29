/**
 * Unit test suite for the pre-paid restock command: money out now, goods later.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordDeliveryIn,
    recordPrePaidRestock,
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

describe("recordPrePaidRestock", () => {
    it("GIVEN goods paid for up front THEN the cost and the money are recorded, and no goods arrive yet", () => {
        const purchase = recordPrePaidRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(purchase).toMatchObject({ type: "PRE_PAID_RESTOCK", linkedDocumentId: null })
        expect(purchase.agreements).toMatchObject([
            {
                productId: coke.id,
                quantity: 10,
                value: -3000,
                unitPrice: null,
                lineDiscount: null,
                documentDiscountShare: null,
            },
        ])
        expect(purchase.movements).toEqual([])
        expect(purchase.payments).toMatchObject([{ method: "Cash", amount: -3000 }])
        // Paid for, so nothing is owed; but the goods are not on the shelf yet
        expect(owedOn(db, purchase.id)).toBe(0)
        expect(totals(db)).toEqual({ stock: 0, cash: -3000, agreed: -3000 })
    })

    it("GIVEN the goods arrive later THEN the stock rises only then", () => {
        const purchase = recordPrePaidRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(totals(db).stock).toBe(0)

        recordDeliveryIn(db, {
            performedBy: boss.id,
            documentId: purchase.id,
            items: [{ productId: coke.id, quantity: 10 }],
        })

        expect(totals(db).stock).toBe(10)
    })

    it("GIVEN less paid than the goods cost THEN it is refused: pre-paid means paid now", () => {
        expect(() =>
            recordPrePaidRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
                payments: [{ method: "Cash", amount: 1000 }],
            }),
        ).toThrow(/A PRE_PAID_RESTOCK settles exactly, but 2000 is unsettled/)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN more paid than the goods cost THEN it is refused: paying a supplier extra is an expense of its own", () => {
        expect(() =>
            recordPrePaidRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
                payments: [{ method: "Cash", amount: 3500 }],
            }),
        ).toThrow(/A PRE_PAID_RESTOCK settles exactly, but 500 is over/)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN one line thrown in for free inside a purchase THEN it is allowed and costs nothing", () => {
        const purchase = recordPrePaidRestock(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 10, totalCost: 3000 },
                { productId: water.id, quantity: 2, totalCost: 0 },
            ],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(purchase.agreements.map((row) => row.value)).toEqual([-3000, 0])
    })

    it("GIVEN a purchase that cost nothing at all THEN it is refused, because goods arriving for free is a different kind of event", () => {
        expect(() =>
            recordPrePaidRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 10, totalCost: 0 }],
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(/must be worth something/)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
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
            expect(() => recordPrePaidRestock(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordPrePaidRestock(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const purchase = recordPrePaidRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(purchase.occurredAt).toEqual(AT)
        expect(purchase.notes).toBeNull()
    })

    it("GIVEN a cost that is negative or not whole cents THEN it is refused as bad input", () => {
        for (const totalCost of [-1, 1.5]) {
            expect(() =>
                recordPrePaidRestock(db, {
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
                recordPrePaidRestock(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity, totalCost: 100 }],
                    payments: [{ method: "Cash", amount: 100 }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN one bad line among valid ones THEN it is refused, naming the line: a valid first line does not vouch for the rest", () => {
        const badQuantity = () =>
            recordPrePaidRestock(db, {
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
            recordPrePaidRestock(db, {
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

    it("GIVEN a product that does not exist, or is inactive THEN buying more of it is refused", () => {
        expect(() =>
            recordPrePaidRestock(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1, totalCost: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(NotFoundError)

        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })
        expect(() =>
            recordPrePaidRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordPrePaidRestock(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1, totalCost: 100 },
                    { productId: coke.id, quantity: 2, totalCost: 200 },
                ],
                payments: [{ method: "Cash", amount: 300 }],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN a field the command does not accept inside an item THEN it is refused the same way, naming the line", () => {
        expect(() =>
            recordPrePaidRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 2, totalCost: 200, unitCost: 100 }],
                payments: [{ method: "Cash", amount: 200 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "unitCost"/)
    })
})
