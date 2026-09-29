/**
 * Unit test suite for the payment-in command: money arriving against a credit
 * sale.
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
} from "../../../../src/bll/index.js"
import type { DB, LedgerDocument, ProductRow, SalesmanRow } from "../../../../src/dal/index.js"
import { AT, names, owedOn, setup, totals, without } from "../../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow
let credit: LedgerDocument

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = createProduct(db, { name: "Coke", sellPrice: 500, isActive: true, changedBy: boss.id })
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

    it("GIVEN more than is owed THEN it is refused: what the shop keeps on top is a document of its own", () => {
        expect(() =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 1700 }],
            }),
        ).toThrow(/1500 is owed on .* and 0 already settled, so 1700 more cannot/)
        expect(owedOn(db, credit.id)).toBe(1500)
    })

    it("GIVEN instalments that would overshoot together THEN it is refused, counting what earlier ones settled", () => {
        recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 1000 }],
        })

        expect(() =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 600 }],
            }),
        ).toThrow(/1500 is owed on .* and 1000 already settled, so 600 more cannot/)
        expect(owedOn(db, credit.id)).toBe(500)
    })

    it("GIVEN a sale that was already settled THEN paying again is refused: there is nothing left to settle", () => {
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
        ).toThrow(/1500 is owed on .* and 1500 already settled, so 100 more cannot/)
    })

    it("GIVEN a payment that was voided THEN what it settled is owed again, and can be paid once more", () => {
        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 1500 }],
        })
        recordVoid(db, { performedBy: boss.id, documentId: payment.id })

        expect(owedOn(db, credit.id)).toBe(1500)
        expect(() =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 1500 }],
            }),
        ).not.toThrow()
    })

    it("GIVEN a payment split between methods THEN each one is recorded with its own", () => {
        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [
                { method: "Cash", amount: 500 },
                { method: "PIX", amount: 1000 },
            ],
        })

        expect(payment.payments).toMatchObject([
            { method: "Cash", amount: 500 },
            { method: "PIX", amount: 1000 },
        ])
        expect(owedOn(db, credit.id)).toBe(0)
    })

    it("GIVEN a credit sale with a payment on it THEN voiding the sale is refused until the payment is voided first", () => {
        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: credit.id })).toThrow(
            /has a PAYMENT_IN on it; void that first/,
        )

        recordVoid(db, { performedBy: boss.id, documentId: payment.id })
        expect(() => recordVoid(db, { performedBy: boss.id, documentId: credit.id })).not.toThrow()
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

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 500 }],
        }

        for (const path of [
            "performedBy",
            "documentId",
            "payments",
            "payments.0.method",
            "payments.0.amount",
        ]) {
            expect(() => recordPaymentIn(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordPaymentIn(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const payment = recordPaymentIn(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(payment.occurredAt).toEqual(AT)
        expect(payment.notes).toBeNull()
    })

    it("GIVEN one bad payment among valid ones THEN it is refused, naming the line", () => {
        const attempt = () =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [
                    { method: "Cash", amount: 100 },
                    { method: "PIX", amount: -1 },
                ],
            })

        expect(attempt).toThrow(InvalidInputError)
        expect(attempt).toThrow(names("payments.1.amount"))
    })

    it("GIVEN items passed in anyway THEN it is refused rather than quietly dropped: a payment moves no goods", () => {
        expect(() =>
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
                items: [{ productId: coke.id, quantity: 1 }],
            } as never),
        ).toThrow(/Unrecognized key: "items"/)
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

    it("GIVEN a salesman who does not exist, or is inactive THEN no money moves", () => {
        expect(() =>
            recordPaymentIn(db, {
                performedBy: "nobody",
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(NotFoundError)

        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })
        expect(() =>
            recordPaymentIn(db, {
                performedBy: inactive.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)
        expect(owedOn(db, credit.id)).toBe(1500)
    })
})

afterEach(() => {
    vi.useRealTimers()
})
