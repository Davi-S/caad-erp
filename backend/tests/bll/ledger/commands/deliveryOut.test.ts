/**
 * Unit test suite for the delivery command: goods leaving against a sale that
 * already paid for them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createProduct,
    createSalesman,
    InactiveError,
    InvalidInputError,
    NotFoundError,
    recordCreditSale,
    recordDeliveryOut,
    recordPrePaidSale,
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
import { AT, names, setup, stockOf, totals, without } from "../../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow
let water: ProductRow
let prePaid: LedgerDocument

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    ;({ db, boss } = setup())
    coke = createProduct(db, { name: "Coke", sellPrice: 500, isActive: true, changedBy: boss.id })
    water = createProduct(db, { name: "Water", sellPrice: 300, isActive: true, changedBy: boss.id })
    prePaid = recordPrePaidSale(db, {
        performedBy: boss.id,
        items: [
            { productId: coke.id, quantity: 4 },
            { productId: water.id, quantity: 2 },
        ],
        payments: [{ method: "Cash", amount: 2600 }],
    })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("recordDeliveryOut", () => {
    it("GIVEN goods collected THEN only the goods leaving is recorded: the deal and the money stay on the sale", () => {
        const delivery = recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 4 }],
        })

        expect(delivery).toMatchObject({ type: "DELIVERY_OUT", linkedDocumentId: prePaid.id })
        expect(delivery.agreements).toEqual([])
        expect(delivery.payments).toEqual([])
        expect(delivery.movements).toMatchObject([{ productId: coke.id, quantity: -4 }])
        expect(stockOf(db, coke.id)).toBe(-4)
        // Nothing about what was agreed or paid changes by collecting the goods
        expect(totals(db)).toEqual({ stock: -4, cash: 2600, agreed: 2600 })
    })

    it("GIVEN goods collected a few at a time THEN each delivery is allowed until the sale is fully taken", () => {
        recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })

        expect(stockOf(db, coke.id)).toBe(-4)
    })

    it("GIVEN more units than the sale agreed THEN it is refused, counting what earlier deliveries took", () => {
        recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 3 }],
        })

        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                items: [{ productId: coke.id, quantity: 2 }],
            }),
        ).toThrow(/4 of .* was agreed and 3 already moved, so 2 more cannot/)
        expect(stockOf(db, coke.id)).toBe(-3)
    })

    it("GIVEN more units than the sale agreed in one go THEN it is refused before anything moves", () => {
        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                items: [{ productId: coke.id, quantity: 5 }],
            }),
        ).toThrow(/4 of .* was agreed and 0 already moved, so 5 more cannot/)
        expect(stockOf(db, coke.id)).toBe(0)
    })

    it("GIVEN a product the sale never agreed THEN it is refused: a delivery hands over what was bought", () => {
        const juice = createProduct(db, {
            name: "Juice",
            sellPrice: 400,
            isActive: true,
            changedBy: boss.id,
        })

        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                items: [{ productId: juice.id, quantity: 1 }],
            }),
        ).toThrow(/Nothing was agreed for .* on /)
    })

    it("GIVEN a delivery that was voided THEN its units are owed again, because the void gave them back", () => {
        const delivery = recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 4 }],
        })
        recordVoid(db, { performedBy: boss.id, documentId: delivery.id })

        expect(stockOf(db, coke.id)).toBe(0)

        // All four can go out again: the voided delivery took nothing
        const again = recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 4 }],
        })

        expect(again.movements).toMatchObject([{ quantity: -4 }])
        expect(stockOf(db, coke.id)).toBe(-4)
    })

    it("GIVEN a sale that was voided THEN nothing can be collected against it", () => {
        recordVoid(db, { performedBy: boss.id, documentId: prePaid.id })

        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(new RegExp(`${prePaid.id} is voided`))
    })

    it("GIVEN a sale with a delivery on it THEN voiding the sale is refused until the delivery is voided first", () => {
        const delivery = recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(() => recordVoid(db, { performedBy: boss.id, documentId: prePaid.id })).toThrow(
            /has a DELIVERY_OUT on it; void that first/,
        )

        recordVoid(db, { performedBy: boss.id, documentId: delivery.id })
        expect(() => recordVoid(db, { performedBy: boss.id, documentId: prePaid.id })).not.toThrow()
    })

    it("GIVEN a document that owes no goods THEN it is refused: only a pre-paid sale has goods to hand over", () => {
        const counter = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        for (const target of [counter, credit]) {
            expect(() =>
                recordDeliveryOut(db, {
                    performedBy: boss.id,
                    documentId: target.id,
                    items: [{ productId: coke.id, quantity: 1 }],
                }),
            ).toThrow(/cannot be linked to a/)
        }
    })

    it("GIVEN a product that went inactive after it was sold THEN it can still be collected", () => {
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        const delivery = recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 4 }],
        })

        expect(delivery.movements).toMatchObject([{ quantity: -4 }])
    })

    it("GIVEN a salesman who does not exist, or is inactive THEN nothing is handed over", () => {
        expect(() =>
            recordDeliveryOut(db, {
                performedBy: "nobody",
                documentId: prePaid.id,
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(NotFoundError)

        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })
        expect(() =>
            recordDeliveryOut(db, {
                performedBy: inactive.id,
                documentId: prePaid.id,
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(InactiveError)
        expect(listDocuments(db)).toHaveLength(1)
    })

    it("GIVEN a document that does not exist THEN it is refused as missing", () => {
        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: "nope",
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(NotFoundError)
    })

    it("GIVEN goods collected earlier and entered later THEN the delivery keeps the day they were collected", () => {
        const yesterday = new Date(AT.getTime() - 86_400_000)

        const delivery = recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            occurredAt: yesterday,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(delivery.occurredAt).toEqual(yesterday)
        expect(delivery.recordedAt).toEqual(AT)
    })

    it("GIVEN a delivery dated in the future THEN it is refused, as any document is", () => {
        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                occurredAt: new Date(AT.getTime() + 86_400_000),
                items: [{ productId: coke.id, quantity: 1 }],
            }),
        ).toThrow(/cannot have happened after it was recorded/)
    })

    it("GIVEN any mandatory field left out THEN it is refused, naming it", () => {
        const valid = {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 1 }],
        }

        for (const path of [
            "performedBy",
            "documentId",
            "items",
            "items.0.productId",
            "items.0.quantity",
        ]) {
            expect(() => recordDeliveryOut(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => recordDeliveryOut(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }
    })

    it("GIVEN only the mandatory fields THEN the rest falls back to today and no note", () => {
        const delivery = recordDeliveryOut(db, {
            performedBy: boss.id,
            documentId: prePaid.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })

        expect(delivery.occurredAt).toEqual(AT)
        expect(delivery.notes).toBeNull()
    })

    it("GIVEN a quantity that is not a positive whole number of units THEN it is refused as bad input", () => {
        for (const quantity of [0, -1, 1.5]) {
            expect(() =>
                recordDeliveryOut(db, {
                    performedBy: boss.id,
                    documentId: prePaid.id,
                    items: [{ productId: coke.id, quantity }],
                }),
            ).toThrow(InvalidInputError)
        }
    })

    it("GIVEN one bad line among valid ones THEN it is refused, naming the line: a valid first line does not vouch for the rest", () => {
        for (const quantity of [0, -1, 1.5]) {
            const attempt = () =>
                recordDeliveryOut(db, {
                    performedBy: boss.id,
                    documentId: prePaid.id,
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
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: coke.id, quantity: 1 },
                ],
            }),
        ).toThrow(/items\.1\.productId: This product is already listed/)
    })

    it("GIVEN payments passed in anyway THEN it is refused rather than quietly dropped: the sale was already paid", () => {
        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                items: [{ productId: coke.id, quantity: 1 }],
                payments: [{ method: "Cash", amount: 500 }],
            } as never),
        ).toThrow(/Unrecognized key: "payments"/)
    })

    it("GIVEN a field the command does not accept inside an item THEN it is refused the same way, naming the line", () => {
        expect(() =>
            recordDeliveryOut(db, {
                performedBy: boss.id,
                documentId: prePaid.id,
                items: [{ productId: coke.id, quantity: 1, unitPrice: 500 }],
            } as never),
        ).toThrow(/items\.0: Unrecognized key: "unitPrice"/)
    })
})
