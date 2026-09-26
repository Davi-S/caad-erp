/**
 * Unit test suite for the payment-in command: money arriving against a credit
 * sale.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
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
} from "../../../../src/bll/index.js"
import type { DB, LedgerDocument, ProductRow, SalesmanRow } from "../../../../src/dal/index.js"
import { AT, owedOn, product, setup, totals } from "../../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow
let credit: LedgerDocument

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = product(db, boss.id, { name: "Coke", sellPrice: 500 })
    credit = recordCreditSale(db, {
        performedBy: boss.id,
        items: [{ productId: coke.id, quantity: 3 }],
    })
})

describe("recordPaymentIn", () => {
    it("GIVEN money handed over against a credit sale THEN only the money is recorded, and it points at the sale", () => {
        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(payment).toMatchObject({ type: "PAYMENT_IN", linkedDocumentId: credit.id })
        expect(payment.agreements).toEqual([])
        expect(payment.movements).toEqual([])
        expect(payment.payments).toMatchObject([{ method: "Cash", amount: 500 }])
        // The goods left when the sale was made; this document moves none
        expect(totals(db)).toEqual({ stock: -3, cash: 500, agreed: 1500 })
    })

    it("GIVEN instalments THEN each one reduces what is owed, and the sale is settled when they add up", () => {
        expect(owedOn(db, credit.id)).toBe(1500)

        recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 500 }],
        })
        expect(owedOn(db, credit.id)).toBe(1000)

        recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [
                { method: "PIX", amount: 600 },
                { method: "Cash", amount: 400 },
            ],
        })
        expect(owedOn(db, credit.id)).toBe(0)
    })

    it("GIVEN more than is owed THEN it is allowed, and the sale is left holding a credit", () => {
        recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 1700 }],
        })

        expect(owedOn(db, credit.id)).toBe(-200)
    })

    it("GIVEN a sale that was already settled THEN paying again is still allowed: nothing is capped here", () => {
        recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 1500 }],
        })

        expect(() =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).not.toThrow()
    })

    it("GIVEN anything other than a credit sale THEN it is refused, naming what was pointed at", () => {
        const sale = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })
        const restock = recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
            payments: [{ method: "Cash", amount: 100 }],
        })
        const writeOff = recordWriteOff(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        const voided = recordVoid(db, { performedBy: boss.id, documentId: writeOff.id })
        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 100 }],
        })

        for (const [target, type] of [
            [sale, "SALE"],
            [restock, "RESTOCK"],
            [writeOff, "WRITE_OFF"],
            [voided, "VOID"],
            [payment, "PAYMENT_IN"],
        ] as const) {
            expect(() =>
                recordPaymentIn(db, {
                    performedBy: boss.id,
                    documentId: target.id,
                    payments: [{ method: "Cash", amount: 100 }],
                }),
            ).toThrow(`A PAYMENT_IN cannot be linked to a ${type}`)
        }
    })

    it("GIVEN a credit sale that was voided THEN paying it is refused: it never happened", () => {
        recordVoid(db, { performedBy: boss.id, documentId: credit.id })

        expect(() =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(/is voided/)
    })

    it("GIVEN a document that does not exist THEN it is refused as missing", () => {
        expect(() =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: "nope",
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(NotFoundError)
    })

    it("GIVEN no money, or money that is not whole positive cents THEN it is refused as bad input", () => {
        for (const payments of [
            [],
            [{ method: "Cash" as const, amount: 0 }],
            [{ method: "Cash" as const, amount: 1.5 }],
        ]) {
            expect(() =>
                recordPaymentIn(db, { performedBy: boss.id, documentId: credit.id, payments }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN a payment received earlier and entered later THEN it keeps the day it was received", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            occurredAt: yesterday,
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(payment.occurredAt).toEqual(yesterday)
        expect(payment.recordedAt).toEqual(AT)
    })

    it("GIVEN a salesman who has left THEN the payment is refused", () => {
        const gone = createSalesman(db, { name: "Gone", isActive: false, changedBy: boss.id })

        expect(() =>
            recordPaymentIn(db, {
                performedBy: gone.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)
    })
})

afterEach(() => {
    vi.useRealTimers()
})
