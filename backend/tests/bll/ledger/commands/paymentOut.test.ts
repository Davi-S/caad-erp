/**
 * Unit test suite for the payment out command: money leaving against a debt the
 * shop took on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordCreditRestock,
    recordPaymentOut,
    recordRestock,
    recordVoid,
} from "../../../../src/bll/index.js"
import {
    listDocuments,
    type DB,
    type LedgerDocument,
    type ProductRow,
    type SalesmanRow,
} from "../../../../src/dal/index.js"
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
    credit = recordCreditRestock(db, {
        performedBy: boss.id,
        items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
    })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("recordPaymentOut", () => {
    it("GIVEN a supplier paid THEN only the money leaving is recorded, and the debt falls by it", () => {
        const payment = recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 3000 }],
        })

        expect(payment).toMatchObject({ type: "PAYMENT_OUT", linkedDocumentId: credit.id })
        expect(payment.agreements).toEqual([])
        expect(payment.movements).toEqual([])
        // Money leaves, so it is stored negative
        expect(payment.payments).toMatchObject([{ method: "Cash", amount: -3000 }])
        expect(owedOn(db, credit.id)).toBe(0)
        expect(totals(db)).toEqual({ stock: 10, cash: -3000, agreed: -3000 })
    })

    it("GIVEN the debt paid in instalments THEN each one brings it down until nothing is left", () => {
        recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 1000 }],
        })
        expect(owedOn(db, credit.id)).toBe(-2000)

        recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "PIX", amount: 2000 }],
        })
        expect(owedOn(db, credit.id)).toBe(0)
    })

    it("GIVEN a payment split between methods THEN each one is recorded with its own", () => {
        const payment = recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [
                { method: "Cash", amount: 1000 },
                { method: "PIX", amount: 2000 },
            ],
        })

        expect(payment.payments).toMatchObject([
            { method: "Cash", amount: -1000 },
            { method: "PIX", amount: -2000 },
        ])
        expect(owedOn(db, credit.id)).toBe(0)
    })

    it("GIVEN more paid than is owed THEN it is allowed, and leaves the supplier owing us the difference", () => {
        recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 3500 }],
        })

        expect(owedOn(db, credit.id)).toBe(500)
    })

    it("GIVEN a restock already paid at the counter THEN there is nothing to settle against it", () => {
        const paid = recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(() =>
            recordPaymentOut(db, {
                performedBy: boss.id,
                documentId: paid.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(/cannot be linked to a/)
    })

    it("GIVEN a credit restock that was voided THEN nothing can be paid against it", () => {
        recordVoid(db, { performedBy: boss.id, documentId: credit.id })

        expect(() =>
            recordPaymentOut(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(new RegExp(`${credit.id} is voided`))
    })

    it("GIVEN a credit restock with a payment on it THEN voiding the restock is refused until the payment is voided first", () => {
        const payment = recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 1000 }],
        })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: credit.id })).toThrow(
            /has a PAYMENT_OUT on it; void that first/,
        )

        recordVoid(db, { performedBy: boss.id, documentId: payment.id })
        expect(() => recordVoid(db, { performedBy: boss.id, documentId: credit.id })).not.toThrow()
    })

    it("GIVEN a voided payment THEN the debt stands again, because the money came back", () => {
        const payment = recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 3000 }],
        })
        expect(owedOn(db, credit.id)).toBe(0)

        recordVoid(db, { performedBy: boss.id, documentId: payment.id })

        expect(owedOn(db, credit.id)).toBe(-3000)
        expect(totals(db).cash).toBe(0)
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN no money moves", () => {
        expect(() =>
            recordPaymentOut(db, {
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
            recordPaymentOut(db, {
                performedBy: inactive.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)
        expect(listDocuments(db)).toHaveLength(1)
    })

    it("GIVEN a document that does not exist THEN it is refused as missing", () => {
        expect(() =>
            recordPaymentOut(db, {
                performedBy: boss.id,
                documentId: "nope",
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(NotFoundError)
    })

    it("GIVEN money paid earlier and entered later THEN it keeps the day it was paid", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const payment = recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            occurredAt: yesterday,
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(payment.occurredAt).toEqual(yesterday)
        expect(payment.recordedAt).toEqual(AT)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 100 }],
        }

        for (const path of [
            "performedBy",
            "documentId",
            "payments",
            "payments.0.method",
            "payments.0.amount",
        ]) {
            expect(() => recordPaymentOut(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordPaymentOut(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const payment = recordPaymentOut(db, {
            performedBy: boss.id,
            documentId: credit.id,
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(payment.occurredAt).toEqual(AT)
        expect(payment.notes).toBeNull()
    })

    it("GIVEN no money, or money that is not whole positive cents THEN it is refused as bad input", () => {
        for (const payments of [
            [],
            [{ method: "Cash" as const, amount: 0 }],
            [{ method: "Cash" as const, amount: 1.5 }],
        ]) {
            expect(() =>
                recordPaymentOut(db, { performedBy: boss.id, documentId: credit.id, payments }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN one bad payment among valid ones THEN it is refused, naming the line", () => {
        const attempt = () =>
            recordPaymentOut(db, {
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
            recordPaymentOut(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
                items: [{ productId: coke.id, quantity: 1 }],
            } as never),
        ).toThrow(/Unrecognized key: "items"/)
    })
})
