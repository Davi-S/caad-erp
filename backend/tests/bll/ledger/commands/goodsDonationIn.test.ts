/**
 * Unit test suite for the goods donation command: stock arriving with no deal
 * behind it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordGoodsDonationIn,
    recordPrePaidRestock,
    recordSale,
    recordVoid,
    updateProduct,
} from "../../../../src/bll/index.js"
import {
    listDocuments,
    type DB,
    type ProductRow,
    type SalesmanRow,
} from "../../../../src/dal/index.js"
import { AT, names, setup, stockOf, totals, without } from "../../fixtures.js"

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

describe("recordGoodsDonationIn", () => {
    it("GIVEN goods given for nothing THEN only the goods arriving is recorded: they cost nothing and no money moved", () => {
        const donation = recordGoodsDonationIn(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10 }],
        })

        expect(donation).toMatchObject({ type: "GOODS_DONATION_IN", linkedDocumentId: null })
        expect(donation.agreements).toEqual([])
        expect(donation.payments).toEqual([])
        expect(donation.movements).toMatchObject([{ productId: coke.id, quantity: 10 }])
        // The stock is real; nothing was paid or owed for it, so nothing was agreed
        expect(totals(db)).toEqual({ stock: 10, cash: 0, agreed: 0 })
    })

    it("GIVEN donated stock THEN it is on the shelf to sell like any other, though it entered at no cost", () => {
        recordGoodsDonationIn(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10 }],
        })

        recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 4 }],
            payments: [{ method: "Cash", amount: 2000 }],
        })

        expect(stockOf(db, coke.id)).toBe(6)
        // All of what was taken is agreed: nothing was ever costed against it
        expect(totals(db)).toEqual({ stock: 6, cash: 2000, agreed: 2000 })
    })

    it("GIVEN several products given at once THEN each one comes onto the shelf", () => {
        const donation = recordGoodsDonationIn(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 10 },
                { productId: water.id, quantity: 5 },
            ],
        })

        expect(donation.movements).toMatchObject([
            { productId: coke.id, quantity: 10 },
            { productId: water.id, quantity: 5 },
        ])
        expect(stockOf(db, coke.id)).toBe(10)
        expect(stockOf(db, water.id)).toBe(5)
    })

    it("GIVEN a donation that should not have been entered THEN voiding it takes the goods back off the shelf", () => {
        const donation = recordGoodsDonationIn(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10 }],
        })

        const voided = recordVoid(db, { performedBy: boss.id, documentId: donation.id })

        expect(voided.movements).toMatchObject([{ productId: coke.id, quantity: -10 }])
        expect(stockOf(db, coke.id)).toBe(0)
    })

    it("GIVEN a product that does not exist, or is no longer sold THEN it is refused: stock is not taken on either way", () => {
        expect(() =>
            recordGoodsDonationIn(db, {
                performedBy: boss.id,
                items: [{ productId: "nope", quantity: 1 }],
            }),
        ).toThrow(NotFoundError)

        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })
        expect(() =>
            recordGoodsDonationIn(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(InactiveError)
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN nothing is recorded", () => {
        expect(() =>
            recordGoodsDonationIn(db, {
                performedBy: "nobody",
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(NotFoundError)

        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })
        expect(() =>
            recordGoodsDonationIn(db, {
                performedBy: inactive.id,
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(InactiveError)
        expect(listDocuments(db)).toHaveLength(0)
    })

    it("GIVEN goods given earlier and entered later THEN it keeps the day they were given", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const donation = recordGoodsDonationIn(db, {
            performedBy: boss.id,
            occurredAt: yesterday,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(donation.occurredAt).toEqual(yesterday)
        expect(donation.recordedAt).toEqual(AT)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        }

        for (const path of ["performedBy", "items", "items.0.productId", "items.0.quantity"]) {
            expect(() => recordGoodsDonationIn(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordGoodsDonationIn(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const donation = recordGoodsDonationIn(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(donation.occurredAt).toEqual(AT)
        expect(donation.notes).toBeNull()
    })

    it("GIVEN a note saying who gave them THEN it is kept with the donation", () => {
        const donation = recordGoodsDonationIn(db, {
            performedBy: boss.id,
            notes: "  from the neighbours  ",
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(donation.notes).toBe("from the neighbours")
    })

    it("GIVEN a quantity that is not a positive whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordGoodsDonationIn(db, {
                    performedBy: boss.id,
                    items: [{ productId: coke.id, quantity }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN one bad line among valid ones THEN it is refused, naming the line: a valid first line does not vouch for the rest", () => {
        for (const quantity of [0, -1, 1.5]) {
            const attempt = () =>
                recordGoodsDonationIn(db, {
                    performedBy: boss.id,
                    items: [
                        { productId: coke.id, quantity: 1 },
                        { productId: water.id, quantity },
                    ],
                })

            expect(attempt, String(quantity)).toThrow(InvalidInputError)
            expect(attempt, String(quantity)).toThrow(names("items.1.quantity"))
        }
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordGoodsDonationIn(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: coke.id, quantity: 1 },
                ],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN a document to link it to THEN it is refused rather than quietly dropped: a donation fulfils nothing", () => {
        const purchase = recordPrePaidRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
            payments: [{ method: "Cash", amount: 100 }],
        })

        expect(() =>
            recordGoodsDonationIn(db, {
                performedBy: boss.id,
                documentId: purchase.id,
                items: [{ productId: coke.id, quantity: 1 }],
            } as never),
        ).toThrow(/Unrecognized key: "documentId"/)
    })

    it("GIVEN a cost passed in anyway THEN it is refused rather than quietly dropped: donated goods cost nothing", () => {
        expect(() =>
            recordGoodsDonationIn(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 1, totalCost: 100 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "totalCost"/)
    })
})
