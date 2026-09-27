/**
 * Unit test suite for the expense command: money leaving with no deal behind it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordCreditRestock,
    recordExpense,
    recordMoneyDonationIn,
    recordVoid,
} from "../../../../src/bll/index.js"
import {
    listDocuments,
    type DB,
    type ProductRow,
    type SalesmanRow,
} from "../../../../src/dal/index.js"
import { AT, names, setup, totals, without } from "../../fixtures.js"

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

describe("recordExpense", () => {
    it("GIVEN money spent on something that is not stock THEN only the money leaving is recorded: nothing was agreed and no goods moved", () => {
        const expense = recordExpense(db, {
            performedBy: boss.id,
            notes: "rent",
            payments: [{ method: "PIX", amount: 90000 }],
        })

        expect(expense).toMatchObject({ type: "EXPENSE", linkedDocumentId: null })
        expect(expense.agreements).toEqual([])
        expect(expense.movements).toEqual([])
        // Money leaves, so it is stored negative
        expect(expense.payments).toMatchObject([{ method: "PIX", amount: -90000 }])
        expect(totals(db)).toEqual({ stock: 0, cash: -90000, agreed: 0 })
    })

    it("GIVEN a purchase on credit alongside an expense THEN only the purchase counts as agreed, though both take cash out", () => {
        recordCreditRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
        })
        recordExpense(db, {
            performedBy: boss.id,
            notes: "rent",
            payments: [{ method: "Cash", amount: 90000 }],
        })

        // The restock is owed, not paid: only the expense has moved money
        expect(totals(db)).toEqual({ stock: 10, cash: -90000, agreed: -3000 })
    })

    it("GIVEN a donation received and an expense of the same size THEN the cash they moved cancels out", () => {
        recordMoneyDonationIn(db, {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 5000 }],
        })
        recordExpense(db, {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 5000 }],
        })

        expect(totals(db)).toEqual({ stock: 0, cash: 0, agreed: 0 })
    })

    it("GIVEN an expense split between methods THEN each one is recorded with its own", () => {
        const expense = recordExpense(db, {
            performedBy: boss.id,
            payments: [
                { method: "Cash", amount: 1000 },
                { method: "PIX", amount: 2000 },
            ],
        })

        expect(expense.payments).toMatchObject([
            { method: "Cash", amount: -1000 },
            { method: "PIX", amount: -2000 },
        ])
        expect(totals(db).cash).toBe(-3000)
    })

    it("GIVEN an expense that should not have been entered THEN voiding it brings the money back", () => {
        const expense = recordExpense(db, {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 5000 }],
        })

        const voided = recordVoid(db, { performedBy: boss.id, documentId: expense.id })

        expect(voided.payments).toMatchObject([{ method: "Cash", amount: 5000 }])
        expect(totals(db).cash).toBe(0)
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN nothing is recorded", () => {
        expect(() =>
            recordExpense(db, {
                performedBy: "nobody",
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(NotFoundError)

        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })
        expect(() =>
            recordExpense(db, {
                performedBy: inactive.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN money spent earlier and entered later THEN it keeps the day it was spent", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const expense = recordExpense(db, {
            performedBy: boss.id,
            occurredAt: yesterday,
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(expense.occurredAt).toEqual(yesterday)
        expect(expense.recordedAt).toEqual(AT)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 100 }],
        }

        for (const path of ["performedBy", "payments", "payments.0.method", "payments.0.amount"]) {
            expect(() => recordExpense(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordExpense(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const expense = recordExpense(db, {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(expense.occurredAt).toEqual(AT)
        expect(expense.notes).toBeNull()
    })

    it("GIVEN a note saying what it was for THEN it is kept with the expense", () => {
        const expense = recordExpense(db, {
            performedBy: boss.id,
            notes: "  new fridge motor  ",
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(expense.notes).toBe("new fridge motor")
    })

    it("GIVEN no money, or money that is not whole positive cents THEN it is refused as bad input", () => {
        for (const payments of [
            [],
            [{ method: "Cash" as const, amount: 0 }],
            [{ method: "Cash" as const, amount: 1.5 }],
        ]) {
            expect(() => recordExpense(db, { performedBy: boss.id, payments })).toThrow(
                InvalidInputError,
            )
        }
    })

    it("GIVEN one bad payment among valid ones THEN it is refused, naming the line", () => {
        const attempt = () =>
            recordExpense(db, {
                performedBy: boss.id,
                payments: [
                    { method: "Cash", amount: 100 },
                    { method: "PIX", amount: -1 },
                ],
            })

        expect(attempt).toThrow(InvalidInputError)
        expect(attempt).toThrow(names("payments.1.amount"))
    })

    it("GIVEN a document to link it to THEN it is refused rather than quietly dropped: settling a debt is a payment out, not an expense", () => {
        const credit = recordCreditRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
        })

        expect(() =>
            recordExpense(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            } as never),
        ).toThrow(/Unrecognized key: "documentId"/)
    })

    it("GIVEN items passed in anyway THEN it is refused rather than quietly dropped: money spent on stock is a restock", () => {
        expect(() =>
            recordExpense(db, {
                performedBy: boss.id,
                payments: [{ method: "Cash", amount: 100 }],
                items: [{ productId: coke.id, quantity: 1 }],
            } as never),
        ).toThrow(/Unrecognized key: "items"/)
    })
})
