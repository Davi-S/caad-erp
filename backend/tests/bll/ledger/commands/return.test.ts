/**
 * Unit test suite for the return command: goods brought back and refunded.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordCreditSale,
    recordPrePaidSale,
    recordReturn,
    recordSale,
    recordVoid,
    updateProduct,
} from "../../../../src/bll/index.js"
import {
    listDocuments,
    type DB,
    type LedgerDocument,
    type ProductRow,
    type SalesmanRow,
} from "../../../../src/dal/index.js"
import { AT, names, owedOn, setup, stockOf, totals, without } from "../../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow
let water: ProductRow
let sale: LedgerDocument

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = createProduct(db, { name: "Coke", sellPrice: 500, isActive: true, changedBy: boss.id })
    water = createProduct(db, { name: "Water", sellPrice: 300, isActive: true, changedBy: boss.id })
    sale = recordSale(db, {
        performedBy: boss.id,
        items: [
            { productId: coke.id, quantity: 4 },
            { productId: water.id, quantity: 2 },
        ],
        payments: [{ method: "Cash", amount: 2600 }],
    })
})

/**
 * What the whole ledger has given away in discounts, and what its goods were
 * priced at: sums taken straight off the rows, with no idea that returns exist.
 */
function discountsGiven(db: DB): number {
    return listDocuments(db)
        .flatMap((doc) => doc.agreements)
        .reduce(
            (total, row) => total + (row.lineDiscount ?? 0) + (row.documentDiscountShare ?? 0),
            0,
        )
}

function pricedAt(db: DB): number {
    return listDocuments(db)
        .flatMap((doc) => doc.agreements)
        .reduce((total, row) => total + row.quantity * (row.unitPrice ?? 0), 0)
}

describe("recordReturn", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it("GIVEN a whole line brought back THEN the goods come in, the money goes out, and it points at the sale", () => {
        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 4 }],
            payments: [{ method: "Cash", amount: 2000 }],
        })

        expect(returned).toMatchObject({ type: "RETURN", linkedDocumentId: sale.id })
        expect(returned.agreements).toMatchObject([
            {
                productId: coke.id,
                // Points at the line it takes back, and carries that line's figures
                linkedAgreementId: sale.agreements[0].id,
                quantity: 4,
                value: -2000,
                // The rate is the sale's, unchanged; the quantity reverses it
                unitPrice: 500,
                lineDiscount: 0,
                documentDiscountShare: 0,
            },
        ])
        expect(returned.movements).toMatchObject([
            { productId: coke.id, linkedMovementId: sale.movements[0].id, quantity: 4 },
        ])
        expect(returned.payments).toMatchObject([{ method: "Cash", amount: -2000 }])
        expect(stockOf(db, coke.id)).toBe(0)
        // The water is still sold: 600 of the 2600 stands
        expect(totals(db)).toEqual({ stock: -2, cash: 600, agreed: 600 })
    })

    it("GIVEN a discounted line brought back THEN the refund is what was paid for it, not the catalog price", () => {
        // The sale every test starts with is in the ledger too; what matters is
        // that this one and its return leave it exactly as they found it
        const before = { discounts: discountsGiven(db), gross: pricedAt(db) }
        const discounted = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2, lineDiscount: 100 }],
            documentDiscount: 60,
            payments: [{ method: "Cash", amount: 840 }],
        })

        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: discounted.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 840 }],
        })

        // 2 x 500, less 100 off the line and the whole 60 off the cart
        expect(discounted.agreements[0]).toMatchObject({
            unitPrice: 500,
            lineDiscount: 100,
            documentDiscountShare: 60,
            value: 840,
        })
        // Every amount reverses; the price it was sold at does not
        expect(returned.agreements[0]).toMatchObject({
            unitPrice: 500,
            lineDiscount: -100,
            documentDiscountShare: -60,
            value: -840,
        })
        expect(owedOn(db, discounted.id)).toBe(0)
        expect(discountsGiven(db)).toBe(before.discounts)
        expect(pricedAt(db)).toBe(before.gross)
    })

    it("GIVEN a line brought back a few at a time THEN its discounts come back in the same shares, adding up exactly", () => {
        const before = { discounts: discountsGiven(db), gross: pricedAt(db) }
        const odd = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2, lineDiscount: 100 }],
            documentDiscount: 75,
            payments: [{ method: "Cash", amount: 825 }],
        })

        const first = recordReturn(db, {
            performedBy: boss.id,
            documentId: odd.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 413 }],
        })
        const second = recordReturn(db, {
            performedBy: boss.id,
            documentId: odd.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 412 }],
        })

        // 100 halves evenly, 75 does not: 38 then 37
        expect(first.agreements[0]).toMatchObject({ lineDiscount: -50, documentDiscountShare: -38 })
        expect(second.agreements[0]).toMatchObject({
            lineDiscount: -50,
            documentDiscountShare: -37,
        })

        // Nothing of that sale is left standing in any column
        expect(discountsGiven(db)).toBe(before.discounts)
        expect(pricedAt(db)).toBe(before.gross)
        expect(owedOn(db, odd.id)).toBe(0)
    })

    it("GIVEN a line brought back a few at a time THEN each refund is its share, and the parts add up to the line exactly", () => {
        const odd = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2, lineDiscount: 100 }],
            documentDiscount: 75,
            payments: [{ method: "Cash", amount: 825 }],
        })
        expect(odd.agreements[0].value).toBe(825)

        // 825 over two units does not divide evenly
        const first = recordReturn(db, {
            performedBy: boss.id,
            documentId: odd.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 413 }],
        })
        expect(first.agreements[0].value).toBe(-413)

        const second = recordReturn(db, {
            performedBy: boss.id,
            documentId: odd.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 412 }],
        })
        expect(second.agreements[0].value).toBe(-412)

        // The last unit back takes what is left, so the whole line comes to nothing
        expect(owedOn(db, odd.id)).toBe(0)
        expect(stockOf(db, coke.id)).toBe(-4)
    })

    it("GIVEN more brought back than went out THEN it is refused, counting what earlier returns took", () => {
        recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 3 }],
            payments: [{ method: "Cash", amount: 1500 }],
        })

        expect(() =>
            recordReturn(db, {
                performedBy: boss.id,
                documentId: sale.id,
                items: [{ productId: coke.id, quantity: 2 }],
                payments: [{ method: "Cash", amount: 1000 }],
            }),
        ).toThrow(/4 of .* was sold and 3 already came back, so 2 more cannot/)
        expect(stockOf(db, coke.id)).toBe(-1)
    })

    it("GIVEN a product the sale never sold THEN it is refused", () => {
        const juice = createProduct(db, {
            name: "Juice",
            sellPrice: 400,
            isActive: true,
            changedBy: boss.id,
        })

        expect(() =>
            recordReturn(db, {
                performedBy: boss.id,
                documentId: sale.id,
                items: [{ productId: juice.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 400 }],
            }),
        ).toThrow(/Nothing was sold for .* on /)
    })

    it("GIVEN a return that was voided THEN the units count as never returned, and can come back again", () => {
        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 4 }],
            payments: [{ method: "Cash", amount: 2000 }],
        })
        recordVoid(db, { performedBy: boss.id, documentId: returned.id })

        expect(stockOf(db, coke.id)).toBe(-4)

        const again = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 4 }],
            payments: [{ method: "Cash", amount: 2000 }],
        })

        expect(again.agreements[0].value).toBe(-2000)
        expect(stockOf(db, coke.id)).toBe(0)
    })

    it("GIVEN a sale that was voided THEN nothing can be returned against it", () => {
        const solo = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })
        recordVoid(db, { performedBy: boss.id, documentId: solo.id })

        expect(() =>
            recordReturn(db, {
                performedBy: boss.id,
                documentId: solo.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(new RegExp(`${solo.id} is voided`))
    })

    it("GIVEN a sale with a return on it THEN voiding the sale is refused until the return is voided first", () => {
        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: sale.id })).toThrow(
            /has a RETURN on it; void that first/,
        )

        recordVoid(db, { performedBy: boss.id, documentId: returned.id })
        expect(() => recordVoid(db, { performedBy: boss.id, documentId: sale.id })).not.toThrow()
    })

    it("GIVEN anything but a counter sale THEN it is refused: those are not this event", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        const prePaid = recordPrePaidSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        for (const target of [credit, prePaid]) {
            expect(() =>
                recordReturn(db, {
                    performedBy: boss.id,
                    documentId: target.id,
                    items: [{ productId: coke.id, quantity: 1 }],
                    payments: [{ method: "Cash", amount: 500 }],
                }),
            ).toThrow(/A RETURN cannot be linked to a/)
        }
    })

    it("GIVEN less refunded than the goods were sold for THEN it is refused, and says how much is unsettled", () => {
        expect(() =>
            recordReturn(db, {
                performedBy: boss.id,
                documentId: sale.id,
                items: [{ productId: coke.id, quantity: 4 }],
                payments: [{ method: "Cash", amount: 1000 }],
            }),
        ).toThrow(/A RETURN leaves nothing owing, but 1000 is unsettled/)
        expect(listDocuments(db)).toHaveLength(1)
    })

    it("GIVEN more refunded than the goods were sold for THEN it is allowed, the way handing back extra is", () => {
        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 4 }],
            payments: [{ method: "Cash", amount: 2500 }],
        })

        expect(owedOn(db, returned.id)).toBe(500)
    })

    it("GIVEN a product that went inactive after it was sold THEN it can still come back", () => {
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 4 }],
            payments: [{ method: "Cash", amount: 2000 }],
        })

        expect(returned.movements).toMatchObject([{ quantity: 4 }])
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN nothing comes back", () => {
        expect(() =>
            recordReturn(db, {
                performedBy: "nobody",
                documentId: sale.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(NotFoundError)

        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })
        expect(() =>
            recordReturn(db, {
                performedBy: inactive.id,
                documentId: sale.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(InactiveError)
        expect(listDocuments(db)).toHaveLength(1)
    })

    it("GIVEN a document that does not exist THEN it is refused as missing", () => {
        expect(() =>
            recordReturn(db, {
                performedBy: boss.id,
                documentId: "nope",
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            }),
        ).toThrow(NotFoundError)
    })

    it("GIVEN goods brought back earlier and entered later THEN it keeps the day they came back", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            occurredAt: yesterday,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(returned.occurredAt).toEqual(yesterday)
        expect(returned.recordedAt).toEqual(AT)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        }

        for (const path of [
            "performedBy",
            "documentId",
            "items",
            "items.0.productId",
            "items.0.quantity",
            "payments",
            "payments.0.method",
            "payments.0.amount",
        ]) {
            expect(() => recordReturn(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordReturn(db, without(valid, path) as never), path).toThrow(names(path))
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const returned = recordReturn(db, {
            performedBy: boss.id,
            documentId: sale.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })

        expect(returned.occurredAt).toEqual(AT)
        expect(returned.notes).toBeNull()
    })

    it("GIVEN a quantity that is not a positive whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordReturn(db, {
                    performedBy: boss.id,
                    documentId: sale.id,
                    items: [{ productId: coke.id, quantity }],
                    payments: [{ method: "Cash", amount: 500 }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN one bad line among valid ones THEN it is refused, naming the line: a valid first line does not vouch for the rest", () => {
        for (const quantity of [0, -1, 1.5]) {
            const attempt = () =>
                recordReturn(db, {
                    performedBy: boss.id,
                    documentId: sale.id,
                    items: [
                        { productId: coke.id, quantity: 1 },
                        { productId: water.id, quantity },
                    ],
                    payments: [{ method: "Cash", amount: 800 }],
                })

            expect(attempt, String(quantity)).toThrow(InvalidInputError)
            expect(attempt, String(quantity)).toThrow(names("items.1.quantity"))
        }
    })

    it("GIVEN the same product on two lines THEN the caller is told to say it once", () => {
        expect(() =>
            recordReturn(db, {
                performedBy: boss.id,
                documentId: sale.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: coke.id, quantity: 1 },
                ],
                payments: [{ method: "Cash", amount: 1000 }],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN a refund amount sent with an item THEN it is refused: what a line is worth comes from the sale", () => {
        expect(() =>
            recordReturn(db, {
                performedBy: boss.id,
                documentId: sale.id,
                items: [{ productId: coke.id, quantity: 1, value: 500 }],
                payments: [{ method: "Cash", amount: 500 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "value"/)
    })
})
