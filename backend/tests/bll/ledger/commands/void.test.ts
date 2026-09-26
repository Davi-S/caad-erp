/**
 * Unit test suite for the void command: an entry that should never have been made.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordCreditSale,
    recordPaymentIn,
    recordRestock,
    recordSale,
    recordVoid,
    recordWriteOff,
    updateProduct,
} from "../../../../src/bll/index.js"
import type { DB, ProductRow, SalesmanRow } from "../../../../src/dal/index.js"
import { AT, names, owedOn, setup, stockOf, totals, without } from "../../fixtures.js"

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

function sell(quantity = 2): ReturnType<typeof recordSale> {
    return recordSale(db, {
        performedBy: boss.id,
        items: [{ productId: coke.id, quantity }],
        payments: [{ method: "PIX", amount: quantity * 500 }],
    })
}

describe("recordVoid", () => {
    it("GIVEN a sale that should not have been made THEN every row of it is taken back, each pointing at what it reverses", () => {
        const sale = sell(2)

        const voided = recordVoid(db, { performedBy: boss.id, documentId: sale.id })

        expect(voided).toMatchObject({ type: "VOID", linkedDocumentId: sale.id })
        expect(voided.agreements).toMatchObject([
            {
                productId: coke.id,
                linkedAgreementId: sale.agreements[0].id,
                quantity: 2,
                value: -1000,
                unitPrice: null,
                lineDiscount: null,
                documentDiscountShare: null,
            },
        ])
        expect(voided.movements).toMatchObject([
            { productId: coke.id, linkedMovementId: sale.movements[0].id, quantity: 2 },
        ])
        expect(voided.payments).toMatchObject([
            { method: "PIX", linkedPaymentId: sale.payments[0].id, amount: -1000 },
        ])
    })

    it("GIVEN a voided sale THEN the price and discounts stay on the rows being taken back, not on the void", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2, lineDiscount: 100 }],
            payments: [{ method: "Cash", amount: 900 }],
        })

        const voided = recordVoid(db, { performedBy: boss.id, documentId: sale.id })

        expect(sale.agreements[0]).toMatchObject({ unitPrice: 500, lineDiscount: 100, value: 900 })
        expect(voided.agreements[0]).toMatchObject({ unitPrice: null, value: -900 })
    })

    it("GIVEN anything voided THEN stock, cash and what was agreed all fall back on their own", () => {
        recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })
        const before = totals(db)
        const sale = sell(2)

        recordVoid(db, { performedBy: boss.id, documentId: sale.id })

        expect(totals(db)).toEqual(before)
    })

    it("GIVEN a correction made now for an old entry THEN the void happens today, and the original keeps its own day", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)
        const sale = recordSale(db, {
            performedBy: boss.id,
            occurredAt: yesterday,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        const voided = recordVoid(db, { performedBy: boss.id, documentId: sale.id })

        expect(voided.occurredAt).toEqual(AT)
        expect(voided.recordedAt).toEqual(AT)
        expect(sale.occurredAt).toEqual(yesterday)
    })

    it("GIVEN a day given for the void anyway THEN it is refused: a correction is made when it is made, and cannot be told otherwise", () => {
        const sale = sell(1)

        expect(() =>
            recordVoid(db, {
                performedBy: boss.id,
                documentId: sale.id,
                occurredAt: new Date(AT.getTime() - 86_400_000),
            } as never),
        ).toThrow(/Unrecognized key: "occurredAt"/)
    })

    it("GIVEN a write-off, which has no deal and no money THEN the void takes back only the goods", () => {
        const writeOff = recordWriteOff(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })

        const voided = recordVoid(db, { performedBy: boss.id, documentId: writeOff.id })

        expect(voided.agreements).toEqual([])
        expect(voided.payments).toEqual([])
        expect(voided.movements).toMatchObject([{ quantity: 3 }])
        expect(stockOf(db, coke.id)).toBe(0)
    })

    it("GIVEN a credit sale with a payment on it THEN voiding the sale is refused until the payment is voided first", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })
        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: credit.id })).toThrow(
            /has a PAYMENT_IN on it; void that first/,
        )

        recordVoid(db, { performedBy: boss.id, documentId: payment.id })
        expect(owedOn(db, credit.id)).toBe(1500)

        recordVoid(db, { performedBy: boss.id, documentId: credit.id })
        expect(owedOn(db, credit.id)).toBe(0)
        expect(stockOf(db, coke.id)).toBe(0)
    })

    it("GIVEN two payments where only one was voided THEN voiding the sale is still refused", () => {
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
            payments: [{ method: "Cash", amount: 500 }],
        })

        recordVoid(db, { performedBy: boss.id, documentId: first.id })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: credit.id })).toThrow(
            /has a PAYMENT_IN on it/,
        )
    })

    it("GIVEN a document that was already voided THEN voiding it again is refused: it is voided or it is not", () => {
        const sale = sell(1)
        recordVoid(db, { performedBy: boss.id, documentId: sale.id })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: sale.id })).toThrow(
            /is already voided/,
        )
    })

    it("GIVEN a void THEN it cannot itself be voided: to undo one, record the original again", () => {
        const sale = sell(1)
        const voided = recordVoid(db, { performedBy: boss.id, documentId: sale.id })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: voided.id })).toThrow(
            /A VOID cannot be linked to a VOID/,
        )
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const sale = sell(1)
        const valid = { performedBy: boss.id, documentId: sale.id }

        for (const path of ["performedBy", "documentId"]) {
            expect(() => recordVoid(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordVoid(db, without(valid, path) as never), path).toThrow(names(path))
        }
    })

    it("GIVEN only the mandatory fields THEN the note falls back to none, and the date is not the caller's to give", () => {
        const sale = sell(1)

        const voided = recordVoid(db, { performedBy: boss.id, documentId: sale.id })

        expect(voided.notes).toBeNull()
        expect(voided.occurredAt).toEqual(voided.recordedAt)
    })

    it("GIVEN a document that does not exist THEN it is refused as missing", () => {
        expect(() => recordVoid(db, { performedBy: boss.id, documentId: "nope" })).toThrow(
            NotFoundError,
        )
    })

    it("GIVEN a sale of a product that is inactive THEN it can still be voided", () => {
        const sale = sell(1)
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: sale.id })).not.toThrow()
    })

    it("GIVEN a restock whose units have already been sold THEN voiding it is allowed, and stock is left negative to be reported", () => {
        const restock = recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        })
        sell(2)

        recordVoid(db, { performedBy: boss.id, documentId: restock.id })

        expect(stockOf(db, coke.id)).toBe(-2)
    })

    it("GIVEN a salesman who is inactive THEN they cannot void anything", () => {
        const sale = sell(1)
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() => recordVoid(db, { performedBy: inactive.id, documentId: sale.id })).toThrow(
            InactiveError,
        )
    })

    it("GIVEN a reason for the correction THEN it is kept with the void", () => {
        const sale = sell(1)

        const voided = recordVoid(db, {
            performedBy: boss.id,
            documentId: sale.id,
            notes: "  rang up twice  ",
        })

        expect(voided.notes).toBe("rang up twice")
    })
})
