/**
 * Unit test suite for the money donation command: cash arriving with no deal
 * behind it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordCreditSale,
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

describe("recordMoneyDonationIn", () => {
    it("GIVEN money given for nothing THEN only the money arriving is recorded: nothing was agreed and no goods moved", () => {
        const donation = recordMoneyDonationIn(db, {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 5000 }],
        })

        expect(donation).toMatchObject({ type: "MONEY_DONATION_IN", linkedDocumentId: null })
        expect(donation.agreements).toEqual([])
        expect(donation.movements).toEqual([])
        expect(donation.payments).toMatchObject([{ method: "Cash", amount: 5000 }])
        // The cash is real; nothing was promised for it, so nothing was agreed
        expect(totals(db)).toEqual({ stock: 0, cash: 5000, agreed: 0 })
    })

    it("GIVEN a donation alongside a deal THEN only the deal counts as agreed, though both bring cash in", () => {
        recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
        })
        recordMoneyDonationIn(db, {
            performedBy: boss.id,
            payments: [{ method: "PIX", amount: 5000 }],
        })

        expect(totals(db)).toEqual({ stock: -2, cash: 5000, agreed: 1000 })
    })

    it("GIVEN a donation split between methods THEN each one is recorded with its own", () => {
        const donation = recordMoneyDonationIn(db, {
            performedBy: boss.id,
            payments: [
                { method: "Cash", amount: 1000 },
                { method: "PIX", amount: 2000 },
            ],
        })

        expect(donation.payments).toMatchObject([
            { method: "Cash", amount: 1000 },
            { method: "PIX", amount: 2000 },
        ])
        expect(totals(db).cash).toBe(3000)
    })

    it("GIVEN a donation that should not have been entered THEN voiding it takes the money back out", () => {
        const donation = recordMoneyDonationIn(db, {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 5000 }],
        })

        const voided = recordVoid(db, { performedBy: boss.id, documentId: donation.id })

        expect(voided.payments).toMatchObject([{ method: "Cash", amount: -5000 }])
        expect(totals(db).cash).toBe(0)
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN nothing is recorded", () => {
        expect(() =>
            recordMoneyDonationIn(db, {
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
            recordMoneyDonationIn(db, {
                performedBy: inactive.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        ).toThrow(InactiveError)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN money given earlier and entered later THEN it keeps the day it was given", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const donation = recordMoneyDonationIn(db, {
            performedBy: boss.id,
            occurredAt: yesterday,
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(donation.occurredAt).toEqual(yesterday)
        expect(donation.recordedAt).toEqual(AT)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 100 }],
        }

        for (const path of ["performedBy", "payments", "payments.0.method", "payments.0.amount"]) {
            expect(() => recordMoneyDonationIn(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordMoneyDonationIn(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const donation = recordMoneyDonationIn(db, {
            performedBy: boss.id,
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(donation.occurredAt).toEqual(AT)
        expect(donation.notes).toBeNull()
    })

    it("GIVEN a note saying who gave it THEN it is kept with the donation", () => {
        const donation = recordMoneyDonationIn(db, {
            performedBy: boss.id,
            notes: "  from the neighbours  ",
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(donation.notes).toBe("from the neighbours")
    })

    it("GIVEN no money, or money that is not whole positive cents THEN it is refused as bad input", () => {
        for (const payments of [
            [],
            [{ method: "Cash" as const, amount: 0 }],
            [{ method: "Cash" as const, amount: 1.5 }],
        ]) {
            expect(() => recordMoneyDonationIn(db, { performedBy: boss.id, payments })).toThrow(
                InvalidInputError,
            )
        }
    })

    it("GIVEN one bad payment among valid ones THEN it is refused, naming the line", () => {
        const attempt = () =>
            recordMoneyDonationIn(db, {
                performedBy: boss.id,
                payments: [
                    { method: "Cash", amount: 100 },
                    { method: "PIX", amount: -1 },
                ],
            })

        expect(attempt).toThrow(InvalidInputError)
        expect(attempt).toThrow(names("payments.1.amount"))
    })

    it("GIVEN a document to link it to THEN it is refused rather than quietly dropped: a donation fulfils nothing", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(() =>
            recordMoneyDonationIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 500 }],
            } as never),
        ).toThrow(/Unrecognized key: "documentId"/)
    })

    it("GIVEN items passed in anyway THEN it is refused rather than quietly dropped: a money donation moves no goods", () => {
        expect(() =>
            recordMoneyDonationIn(db, {
                performedBy: boss.id,
                payments: [{ method: "Cash", amount: 100 }],
                items: [{ productId: coke.id, quantity: 1 }],
            } as never),
        ).toThrow(/Unrecognized key: "items"/)
    })
})
