/**
 * Unit test suite for the ledger as a whole: what the numbers come to once several
 * commands have run, and what each of them does to the ones already recorded.
 *
 * The three sums here are what the reports will read. Nothing in them asks what a
 * document means, or whether anything was voided: a void's rows are the negation of
 * the rows it takes back, so every sum cancels on its own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createSalesman,
    InactiveError,
    recordCreditSale,
    recordPaymentIn,
    recordRestock,
    recordSale,
    recordVoid,
    recordWriteOff,
    updateProduct,
    updateSalesman,
} from "../../../src/bll/index.js"
import {
    listDocuments,
    type DB,
    type ProductRow,
    type SalesmanRow,
} from "../../../src/dal/index.js"
import { AT, owedOn, product, setup, stockOf, totals } from "../fixtures.js"

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

/** A day's trading: a delivery, a counter sale, a sale on credit, an instalment, a loss. */
function aDay() {
    const restock = recordRestock(db, {
        performedBy: boss.id,
        items: [{ productId: coke.id, quantity: 24, totalCost: 6000 }],
        payments: [{ method: "Cash", amount: 6000 }],
    })
    const sale = recordSale(db, {
        performedBy: boss.id,
        items: [{ productId: coke.id, quantity: 2 }],
        payments: [{ method: "PIX", amount: 1000 }],
    })
    const credit = recordCreditSale(db, {
        performedBy: boss.id,
        items: [{ productId: coke.id, quantity: 3 }],
    })
    const payment = recordPaymentIn(db, {
        performedBy: boss.id,
        documentId: credit.id,
        payments: [{ method: "Cash", amount: 500 }],
    })
    const writeOff = recordWriteOff(db, {
        performedBy: boss.id,
        items: [{ productId: coke.id, quantity: 1 }],
    })
    return { restock, sale, credit, payment, writeOff }
}

describe("a day of trading", () => {
    it("GIVEN a delivery, a sale, a sale on credit, an instalment and a loss THEN stock, cash and what was agreed each come out on their own terms", () => {
        aDay()

        expect(totals(db)).toEqual({
            // 24 in, 2 sold, 3 on credit, 1 lost
            stock: 18,
            // 6000 paid out, 1000 taken, 500 collected
            cash: -4500,
            // the delivery cost, the sale, the credit sale: the loss agreed nothing
            agreed: -3500,
        })
    })

    it("GIVEN a sale on credit with one instalment paid THEN the rest is still owed on it alone", () => {
        const { credit, sale } = aDay()

        expect(owedOn(db, credit.id)).toBe(1000)
        expect(owedOn(db, sale.id)).toBe(0)
    })

    it("GIVEN documents entered one after another THEN they are numbered in the order they were entered", () => {
        aDay()

        expect(listDocuments(db).map((doc) => [doc.sequence, doc.type])).toEqual([
            [1, "RESTOCK"],
            [2, "SALE"],
            [3, "CREDIT_SALE"],
            [4, "PAYMENT_IN"],
            [5, "WRITE_OFF"],
        ])
    })

    it("GIVEN every document of the day voided THEN the three sums fall back to nothing, and nothing is deleted to make that happen", () => {
        const { restock, sale, credit, payment, writeOff } = aDay()

        // The payment first: what hangs off a document is dealt with before it
        for (const target of [payment, credit, sale, writeOff, restock]) {
            recordVoid(db, { performedBy: boss.id, documentId: target.id })
        }

        expect(totals(db)).toEqual({ stock: 0, cash: 0, agreed: 0 })
        expect(listDocuments(db)).toHaveLength(10)
    })
})

describe("correcting a mistake", () => {
    it("GIVEN a sale rung up for the wrong quantity THEN voiding it and entering it again leaves only the corrected position, on the original day", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)
        const wrong = recordSale(db, {
            performedBy: boss.id,
            occurredAt: yesterday,
            items: [{ productId: coke.id, quantity: 5 }],
            payments: [{ method: "Cash", amount: 2500 }],
        })

        recordVoid(db, { performedBy: boss.id, documentId: wrong.id })
        const right = recordSale(db, {
            performedBy: boss.id,
            occurredAt: yesterday,
            items: [{ productId: coke.id, quantity: 3 }],
            payments: [{ method: "Cash", amount: 1500 }],
        })

        expect(totals(db)).toEqual({ stock: -3, cash: 1500, agreed: 1500 })
        expect(right.occurredAt).toEqual(yesterday)
        // The correction was made today, and is the last thing entered
        expect(listDocuments(db).map((doc) => doc.sequence)).toEqual([1, 2, 3])
        expect(right.recordedAt).toEqual(AT)
    })

    it("GIVEN an instalment voided after it was collected THEN the debt goes back up by exactly that much", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })
        const first = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 500 }],
        })
        recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 400 }],
        })
        expect(owedOn(db, credit.id)).toBe(600)

        recordVoid(db, { performedBy: boss.id, documentId: first.id })

        expect(owedOn(db, credit.id)).toBe(1100)
        expect(totals(db).cash).toBe(400)
    })
})

describe("stock that goes negative", () => {
    it("GIVEN a sale made before the delivery was entered THEN it is allowed, and the shortfall shows until the delivery is entered", () => {
        recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })
        expect(stockOf(db, coke.id)).toBe(-2)

        recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(stockOf(db, coke.id)).toBe(8)
    })
})

describe("a product that is deactivated", () => {
    it("GIVEN a product that is inactive THEN nothing new is bought or sold with it, while its remaining stock and its past can still be dealt with", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        expect(() =>
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(InactiveError)
        expect(() =>
            recordRestock(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)

        // Clearing what is left, and correcting what was recorded, both still work
        expect(() =>
            recordWriteOff(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).not.toThrow()
        expect(() => recordVoid(db, { performedBy: boss.id, documentId: sale.id })).not.toThrow()
    })
})

describe("a salesman who is deactivated", () => {
    it("GIVEN a salesman who is inactive THEN their documents stand, they can record nothing more, and someone else can correct their work", () => {
        const helper = createSalesman(db, { name: "Helper", isActive: true, changedBy: boss.id })
        const sale = recordSale(db, {
            performedBy: helper.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        })
        updateSalesman(db, helper.id, { isActive: false, changedBy: boss.id })

        expect(listDocuments(db)[0].performedBy).toBe(helper.id)
        expect(() =>
            recordSale(db, {
                performedBy: helper.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(InactiveError)
        expect(() => recordVoid(db, { performedBy: helper.id, documentId: sale.id })).toThrow(
            InactiveError,
        )

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: sale.id })).not.toThrow()
    })
})

describe("what is unique to a document", () => {
    it("GIVEN the same product sold twice in a day THEN each sale stands on its own: one line per product is a rule about one document", () => {
        for (const quantity of [1, 2]) {
            recordSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity }],
                payments: [{ method: "Cash", amount: quantity * 500 }],
            })
        }

        expect(stockOf(db, coke.id)).toBe(-3)
        expect(listDocuments(db)).toHaveLength(2)
    })

    it("GIVEN a document entered late for an earlier day THEN business time and entry order disagree, and both are kept", () => {
        const today = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })
        const forYesterday = recordSale(db, {
            performedBy: boss.id,
            occurredAt: new Date(AT.getTime() - 86_400_000),
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(listDocuments(db).map((doc) => doc.id)).toEqual([today.id, forYesterday.id])
        expect(forYesterday.occurredAt.getTime()).toBeLessThan(today.occurredAt.getTime())
        expect(forYesterday.sequence).toBeGreaterThan(today.sequence)
    })
})
