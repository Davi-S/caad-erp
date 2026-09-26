/**
 * Unit test suite for the sale command: goods out, money in, both at the counter.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordSale,
    RuleViolationError,
    updateProduct,
} from "../../../../src/bll/index.js"
import {
    getDocument,
    listDocuments,
    type DB,
    type ProductRow,
    type SalesmanRow,
} from "../../../../src/dal/index.js"
import { AT, names, owedOn, product, setup, totals, without } from "../../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow
let water: ProductRow

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = product(db, boss.id, { name: "Coke", sellPrice: 500 })
    water = product(db, boss.id, { name: "Water", sellPrice: 300 })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("recordSale", () => {
    it("GIVEN two units sold and paid for THEN the deal, the goods and the money are each recorded once, with the store gaining", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "PIX", amount: 1000 }],
        })

        expect(sale).toMatchObject({
            type: "SALE",
            sequence: 1,
            linkedDocumentId: null,
            notes: null,
        })
        expect(sale.occurredAt).toEqual(AT)
        expect(sale.recordedAt).toEqual(AT)
        expect(sale.agreements).toMatchObject([
            {
                productId: coke.id,
                linkedAgreementId: null,
                quantity: -2,
                unitPrice: 500,
                lineDiscount: 0,
                documentDiscountShare: 0,
                value: 1000,
            },
        ])
        expect(sale.movements).toMatchObject([
            { productId: coke.id, linkedMovementId: null, quantity: -2 },
        ])
        expect(sale.payments).toMatchObject([
            { method: "PIX", amount: 1000, linkedPaymentId: null },
        ])
        expect(totals(db)).toEqual({ stock: -2, cash: 1000, agreed: 1000 })
    })

    it("GIVEN the catalog price changes afterwards THEN the sale keeps the price it was made at", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })

        updateProduct(db, coke.id, { sellPrice: 900, changedBy: boss.id })

        const stored = getDocument(db, sale.id)!
        expect(stored.agreements[0].unitPrice).toBe(500)
        expect(stored.agreements[0].value).toBe(1000)
    })

    it("GIVEN a discount on one line THEN it comes off that line's value alone", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 2, lineDiscount: 100 },
                { productId: water.id, quantity: 1 },
            ],
            payments: [{ method: "Cash", amount: 1200 }],
        })

        expect(sale.agreements.map((row) => [row.productId, row.lineDiscount, row.value])).toEqual([
            [coke.id, 100, 900],
            [water.id, 0, 300],
        ])
    })

    it("GIVEN a discount over the whole cart THEN it is split in proportion to what each line costs, to the cent", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 2 },
                { productId: water.id, quantity: 1 },
            ],
            documentDiscount: 100,
            payments: [{ method: "Cash", amount: 1200 }],
        })

        // 1000 and 300 of a 1300 cart: 77 and 23 of the 100 given away
        expect(sale.agreements.map((row) => [row.documentDiscountShare, row.value])).toEqual([
            [77, 923],
            [23, 277],
        ])
        expect(sale.agreements.reduce((total, row) => total + row.documentDiscountShare!, 0)).toBe(
            100,
        )
        expect(sale.agreements.reduce((total, row) => total + row.value, 0)).toBe(1200)
    })

    it("GIVEN one item given away inside a cart that is paid for THEN it is allowed, and worth nothing on its own line", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 1, lineDiscount: 500 },
                { productId: water.id, quantity: 1 },
            ],
            payments: [{ method: "Cash", amount: 300 }],
        })

        expect(sale.agreements.map((row) => row.value)).toEqual([0, 300])
        expect(sale.movements.map((row) => row.quantity)).toEqual([-1, -1])
    })

    it("GIVEN a cart that is entirely free THEN it is refused, because giving goods away is a different kind of event", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, lineDiscount: 500 }],
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(/must be worth something/)
    })

    it("GIVEN a discount larger than the cart THEN it is refused rather than turning the sale into a payout", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
                documentDiscount: 600,
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(/Value cannot be negative: -100/)
    })

    it("GIVEN a line discount larger than the line THEN it is refused the same way", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, lineDiscount: 600 }],
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(/Value cannot be negative/)
    })

    it("GIVEN a cart split between cash and PIX THEN each payment is recorded with its own method", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [
                { method: "Cash", amount: 400 },
                { method: "PIX", amount: 600 },
            ],
        })

        expect(sale.payments.map((row) => [row.method, row.amount])).toEqual([
            ["Cash", 400],
            ["PIX", 600],
        ])
        expect(owedOn(db, sale.id)).toBe(0)
    })

    it("GIVEN more money than the sale is worth THEN it is allowed, and the sale is left holding a credit", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1200 }],
        })

        expect(owedOn(db, sale.id)).toBe(-200)
    })

    it("GIVEN less money than the sale is worth THEN it is refused, and says how much is unsettled", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 2 }],
                payments: [{ method: "Cash", amount: 501 }],
            }),
        ).toThrow(/A SALE leaves nothing owing, but 499 is unsettled/)
    })

    it("GIVEN a rule that refuses the sale THEN nothing at all is written", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 2 }],
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(RuleViolationError)

        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: coke.id, quantity: 2 },
                ],
                payments: [{ method: "Cash", amount: 1500 }],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN an empty cart or no payment THEN it is refused as bad input", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [],
                payments: [{ method: "Cash", amount: 1 }],
            }),
        ).toThrow(/items: At least one item is required/)
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [],
            }),
        ).toThrow(/payments: At least one payment is required/)
    })

    it("GIVEN a quantity that is not a whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordSale(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity }],
                    payments: [{ method: "Cash", amount: 500 }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN a product that does not exist, or is inactive THEN the sale is refused, naming what is wrong", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(NotFoundError)

        updateProduct(db, water.id, { isActive: false, changedBy: boss.id })
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: water.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 300 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN the sale is refused", () => {
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() =>
            recordSale(db, {
                performedBy: "nobody",
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(NotFoundError)
        expect(() =>
            recordSale(db, {
                performedBy: inactive.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN a sale entered for an earlier day THEN it keeps that day, and records that it was entered now", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const sale = recordSale(db, {
            performedBy: boss.id,
            occurredAt: yesterday,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(sale.occurredAt).toEqual(yesterday)
        expect(sale.recordedAt).toEqual(AT)
    })

    it("GIVEN a sale dated in the future THEN it is refused", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                occurredAt: new Date(AT.getTime() + 60_000),
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(/cannot have happened after it was recorded/)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it: a command fills nothing in on the caller's behalf", () => {
        const valid = {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
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
            expect(() => recordSale(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordSale(db, without(valid, path) as never), path).toThrow(names(path))
        }

        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN only the mandatory fields THEN the four that may be left out fall back to today, no note and no discount", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })

        expect(sale.occurredAt).toEqual(AT)
        expect(sale.notes).toBeNull()
        expect(sale.agreements[0]).toMatchObject({ lineDiscount: 0, documentDiscountShare: 0 })
    })

    it("GIVEN a field the command does not accept THEN it is refused, so nothing a caller sends is silently dropped", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
                documentDiscout: 100,
            } as never),
        ).toThrow(/Unrecognized key: "documentDiscout"/)
    })

    it("GIVEN a price sent with an item THEN it is refused: the price comes from the catalog, and a caller cannot set it", () => {
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, unitPrice: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "unitPrice"/)
    })

    it("GIVEN notes THEN they are trimmed, and a blank note is refused rather than stored empty", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            notes: "  for the party  ",
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(sale.notes).toBe("for the party")
        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                notes: "   ",
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(/Notes cannot be blank/)
    })
})
