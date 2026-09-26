/**
 * Unit test suite for the rules engine.
 *
 * Every case starts from a document a command actually produced, so it is valid in
 * every respect but the one being changed. That matters: several of these rules can
 * refuse the same document, and a test that only asserted "it threw" would pass
 * while the wrong rule did the work. Each case names the message it expects.
 *
 * Documents no command can build are built here by hand, because a rule that only
 * a hand-built document can break still has to hold.
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    BusinessError,
    createSalesman,
    InactiveError,
    NotFoundError,
    recordCreditSale,
    recordPaymentIn,
    recordRestock,
    recordSale,
    recordVoid,
    recordWriteOff,
    SPECS,
    updateProduct,
    validateDocument,
    validateInContext,
    type DocumentSpec,
} from "../../../src/bll/index.js"
import type { DB, NewLedgerDocument, ProductRow, SalesmanRow } from "../../../src/dal/index.js"
import { newId } from "../../../src/ids.js"
import { asNew, contextFor, product, setup } from "../fixtures.js"

let db: DB
let boss: SalesmanRow
let coke: ProductRow
let water: ProductRow

beforeEach(() => {
    ;({ db, boss } = setup())
    coke = product(db, boss.id, { name: "Coke", sellPrice: 500 })
    water = product(db, boss.id, { name: "Water", sellPrice: 300 })
})

/** A sale of two Coke, paid in full: the base for most of these cases. */
function sale(): NewLedgerDocument {
    return asNew(
        recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 2 }],
            payments: [{ method: "Cash", amount: 1000 }],
        }),
    )
}

function restock(): NewLedgerDocument {
    return asNew(
        recordRestock(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 10, totalCost: 3000 }],
            payments: [{ method: "Cash", amount: 3000 }],
        }),
    )
}

function writeOff(): NewLedgerDocument {
    return asNew(
        recordWriteOff(db, { performedBy: boss.id, items: [{ productId: coke.id, quantity: 1 }] }),
    )
}

/** Checks a document against the spec of its own type. */
function check(document: NewLedgerDocument, spec: DocumentSpec = SPECS[document.type]): void {
    validateDocument(document, spec)
}

function checkInContext(document: NewLedgerDocument): void {
    validateInContext(document, SPECS[document.type], contextFor(db, document))
}

describe("a document on its own", () => {
    it("GIVEN a document that happened after it was entered THEN it is refused", () => {
        const doc = sale()

        expect(() => check({ ...doc, occurredAt: new Date(doc.recordedAt.getTime() + 1) })).toThrow(
            /cannot have happened after it was recorded/,
        )
    })

    it("GIVEN a document entered at the very moment it happened THEN it is allowed", () => {
        const doc = sale()

        expect(() => check({ ...doc, occurredAt: doc.recordedAt })).not.toThrow()
    })

    it("GIVEN a document checked against the wrong spec THEN it crashes rather than being reported to the caller, because only a wiring mistake can cause it", () => {
        const doc = sale()

        expect(() => check(doc, SPECS.RESTOCK)).toThrow(
            /A SALE was checked against the spec of a RESTOCK/,
        )
        try {
            check(doc, SPECS.RESTOCK)
        } catch (error) {
            expect(error).not.toBeInstanceOf(BusinessError)
        }
    })
})

describe("what a document may point at", () => {
    it("GIVEN a sale pointing at another document THEN it is refused: a sale stands alone", () => {
        const doc = sale()

        expect(() => check({ ...doc, linkedDocumentId: newId() })).toThrow(
            /A SALE cannot have a linked document/,
        )
    })

    it("GIVEN a payment pointing at nothing THEN it is refused: it only exists against something", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        const payment = asNew(
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        )

        expect(() => check({ ...payment, linkedDocumentId: null })).toThrow(
            /A PAYMENT_IN must have a linked document/,
        )
    })

    it("GIVEN a document pointing at itself THEN it is refused", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        const payment = asNew(
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        )

        expect(() => check({ ...payment, linkedDocumentId: payment.id })).toThrow(
            /cannot point at itself/,
        )
    })

    it("GIVEN a payment pointing at something that is not a credit sale THEN it is refused, naming both types", () => {
        const target = recordSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
            payments: [{ method: "Cash", amount: 500 }],
        })
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        const payment = asNew(
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        )

        expect(() => checkInContext({ ...payment, linkedDocumentId: target.id })).toThrow(
            /A PAYMENT_IN cannot be linked to a SALE/,
        )
    })
})

describe("the rows a shape allows", () => {
    it("GIVEN a row stored under another document THEN it is refused", () => {
        const doc = sale()

        expect(() =>
            check({
                ...doc,
                agreements: [{ ...doc.agreements[0], documentId: newId() }],
            }),
        ).toThrow(/Agreement .* belongs to .*, not/)
    })

    it("GIVEN two rows for the same product THEN it is refused, so goods can always be matched to what was agreed", () => {
        const doc = sale()

        expect(() =>
            check({
                ...doc,
                agreements: [doc.agreements[0], { ...doc.agreements[0], id: newId() }],
            }),
        ).toThrow(`A SALE has two agreement rows for ${coke.id}`)
    })

    it("GIVEN a sale with no goods leaving THEN it is refused", () => {
        const doc = sale()

        expect(() => check({ ...doc, movements: [] })).toThrow(
            /A SALE needs at least 1 movement\(s\)/,
        )
    })

    it("GIVEN a write-off carrying money or a deal THEN it is refused: it is neither", () => {
        const doc = writeOff()
        const paid = sale()

        expect(() => check({ ...doc, payments: paid.payments })).toThrow(
            /A WRITE_OFF moves no money/,
        )
        expect(() => check({ ...doc, agreements: paid.agreements })).toThrow(
            /A WRITE_OFF agrees nothing/,
        )
    })

    it("GIVEN a payment carrying goods THEN it is refused: money moved, nothing else did", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        const payment = asNew(
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        )

        expect(() => check({ ...payment, movements: asNew(credit).movements })).toThrow(
            /A PAYMENT_IN moves no goods/,
        )
    })
})

describe("the columns a shape requires", () => {
    it("GIVEN a sale whose deal has no price THEN it is refused: a sale is priced", () => {
        const doc = sale()

        expect(() =>
            check({ ...doc, agreements: [{ ...doc.agreements[0], unitPrice: null }] }),
        ).toThrow(/A SALE must have a unit price/)
    })

    it("GIVEN a purchase whose deal carries a selling price THEN it is refused: what we paid is not what we charge", () => {
        const doc = restock()

        expect(() =>
            check({ ...doc, agreements: [{ ...doc.agreements[0], unitPrice: 500 }] }),
        ).toThrow(/A RESTOCK cannot have a unit price/)
    })

    it("GIVEN a discount below zero THEN it is refused, because a negative discount is a surcharge", () => {
        const doc = sale()

        expect(() =>
            check({ ...doc, agreements: [{ ...doc.agreements[0], lineDiscount: -1 }] }),
        ).toThrow(/Pricing cannot be negative: -1/)
    })

    it("GIVEN a reversal row on a document that reverses nothing THEN it is refused", () => {
        const doc = sale()

        expect(() =>
            check({ ...doc, agreements: [{ ...doc.agreements[0], linkedAgreementId: newId() }] }),
        ).toThrow(/A SALE cannot have a linked agreement/)
    })

    it("GIVEN a void whose row names nothing to take back THEN it is refused", () => {
        const target = sale()
        const voided = asNew(recordVoid(db, { performedBy: boss.id, documentId: target.id }))

        expect(() =>
            check({
                ...voided,
                agreements: [{ ...voided.agreements[0], linkedAgreementId: null }],
            }),
        ).toThrow(/A VOID must have a linked agreement/)
    })
})

describe("the signs a shape requires", () => {
    it("GIVEN goods moving into stock on a sale THEN it is refused", () => {
        const doc = sale()

        expect(() =>
            check({ ...doc, agreements: [{ ...doc.agreements[0], quantity: 2 }] }),
        ).toThrow(/Quantity must be less than zero: 2/)
    })

    it("GIVEN a sale worth less than nothing THEN it is refused", () => {
        const doc = sale()

        expect(() => check({ ...doc, agreements: [{ ...doc.agreements[0], value: -1 }] })).toThrow(
            /Value cannot be negative: -1/,
        )
    })

    it("GIVEN a purchase that earns the store money THEN it is refused", () => {
        const doc = restock()

        expect(() => check({ ...doc, agreements: [{ ...doc.agreements[0], value: 1 }] })).toThrow(
            /Value cannot be positive: 1/,
        )
    })

    it("GIVEN money leaving on a sale THEN it is refused", () => {
        const doc = sale()

        expect(() => check({ ...doc, payments: [{ ...doc.payments[0], amount: -1 }] })).toThrow(
            /Payment amount must be greater than zero: -1/,
        )
    })

    it("GIVEN an amount that is not whole cents THEN it is refused", () => {
        const doc = sale()

        expect(() => check({ ...doc, payments: [{ ...doc.payments[0], amount: 999.5 }] })).toThrow(
            /Payment amount must be a whole number of units or cents/,
        )
    })

    it("GIVEN a way of paying that storage does not know THEN it is refused, since the database does not check it", () => {
        const doc = sale()

        expect(() =>
            check({
                ...doc,
                payments: [{ ...doc.payments[0], method: "Bitcoin" as never }],
            }),
        ).toThrow(/Unknown payment method: Bitcoin/)
    })
})

describe("what follows from the form", () => {
    it("GIVEN a value that does not match the price and discounts THEN it is refused, and says what it should have been", () => {
        const doc = sale()

        expect(() => check({ ...doc, agreements: [{ ...doc.agreements[0], value: 999 }] })).toThrow(
            /Value 999 does not match price and discounts \(expected 1000\)/,
        )
    })

    it("GIVEN a deal worth nothing at all THEN it is refused: goods for nothing are a different kind of event", () => {
        const doc = sale()

        expect(() =>
            check({
                ...doc,
                agreements: [
                    {
                        ...doc.agreements[0],
                        lineDiscount: 1000,
                        documentDiscountShare: 0,
                        value: 0,
                    },
                ],
            }),
        ).toThrow(/A SALE must be worth something/)
    })

    it("GIVEN goods moving that nothing was agreed for THEN it is refused", () => {
        const doc = sale()

        expect(() =>
            check({ ...doc, movements: [{ ...doc.movements[0], productId: water.id }] }),
        ).toThrow(`Nothing was agreed for ${water.id}`)
    })

    it("GIVEN only part of what was agreed moving THEN it is refused: a sale hands over everything now", () => {
        const doc = sale()

        expect(() => check({ ...doc, movements: [{ ...doc.movements[0], quantity: -1 }] })).toThrow(
            /1 of .* moved against 2 agreed/,
        )
    })

    it("GIVEN something agreed that never moved THEN it is refused", () => {
        const doc = asNew(
            recordSale(db, {
                performedBy: boss.id,
                items: [
                    { productId: coke.id, quantity: 1 },
                    { productId: water.id, quantity: 1 },
                ],
                payments: [{ method: "Cash", amount: 800 }],
            }),
        )

        expect(() => check({ ...doc, movements: [doc.movements[0]] })).toThrow(
            /was agreed but did not move/,
        )
    })

    it("GIVEN goods moving the wrong way for the deal THEN it is refused before the quantities are compared", () => {
        const doc = restock()

        expect(() =>
            check({ ...doc, movements: [{ ...doc.movements[0], quantity: -10 }] }),
        ).toThrow(/Quantity must be greater than zero: -10/)
    })

    it("GIVEN a sale that is not paid in full THEN it is refused, and says how much is left", () => {
        const doc = sale()

        expect(() => check({ ...doc, payments: [{ ...doc.payments[0], amount: 400 }] })).toThrow(
            /A SALE leaves nothing owing, but 600 is unsettled/,
        )
    })

    it("GIVEN a purchase that is not paid in full THEN it is refused the same way, with the signs the other way round", () => {
        const doc = restock()

        expect(() => check({ ...doc, payments: [{ ...doc.payments[0], amount: -1000 }] })).toThrow(
            /A RESTOCK leaves nothing owing, but 2000 is unsettled/,
        )
    })

    it("GIVEN a credit sale with nothing paid THEN it is allowed: waiting for the money is what it is for", () => {
        const doc = asNew(
            recordCreditSale(db, {
                performedBy: boss.id,
                items: [{ productId: coke.id, quantity: 2 }],
            }),
        )

        expect(() => check(doc)).not.toThrow()
    })
})

describe("what follows from the intent", () => {
    it("GIVEN a void dated anywhere but now THEN it is refused: a correction is made when it is made", () => {
        const target = sale()
        const voided = asNew(recordVoid(db, { performedBy: boss.id, documentId: target.id }))

        expect(() =>
            check({ ...voided, occurredAt: new Date(voided.recordedAt.getTime() - 1000) }),
        ).toThrow(/A VOID happens when it is recorded/)
    })
})

describe("what a document refers to", () => {
    it("GIVEN a salesman who does not exist, or has left THEN it is refused, and the two cases are told apart", () => {
        const doc = sale()

        const gone = createSalesman(db, { name: "Gone", isActive: false, changedBy: boss.id })

        expect(() => checkInContext({ ...doc, performedBy: "nobody" })).toThrow(NotFoundError)
        expect(() => checkInContext({ ...doc, performedBy: gone.id })).toThrow(InactiveError)
    })

    it("GIVEN a product that no longer exists THEN it is refused as missing", () => {
        const doc = sale()

        expect(() =>
            checkInContext({
                ...doc,
                agreements: [{ ...doc.agreements[0], productId: "nope" }],
                movements: [{ ...doc.movements[0], productId: "nope" }],
            }),
        ).toThrow(NotFoundError)
    })

    it("GIVEN a sale of a product that is no longer sold THEN it is refused", () => {
        const doc = sale()
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        expect(() => checkInContext(doc)).toThrow(InactiveError)
    })

    it("GIVEN a write-off of a product that is no longer sold THEN it is allowed: leftovers still have to be cleared", () => {
        const doc = writeOff()
        updateProduct(db, coke.id, { isActive: false, changedBy: boss.id })

        expect(() => checkInContext(doc)).not.toThrow()
    })
})

describe("what follows from the documents around it", () => {
    it("GIVEN a payment against a sale that was voided THEN it is refused", () => {
        const credit = recordCreditSale(db, {
            performedBy: boss.id,
            items: [{ productId: coke.id, quantity: 1 }],
        })
        const payment = asNew(
            recordPaymentIn(db, {
                performedBy: boss.id,
                documentId: credit.id,
                payments: [{ method: "Cash", amount: 100 }],
            }),
        )
        recordVoid(db, { performedBy: boss.id, documentId: payment.id })
        recordVoid(db, { performedBy: boss.id, documentId: credit.id })

        expect(() => checkInContext(payment)).toThrow(`${credit.id} is voided`)
    })

    it("GIVEN a void that leaves some of the target behind THEN it is refused, kind by kind", () => {
        const target = recordSale(db, {
            performedBy: boss.id,
            items: [
                { productId: coke.id, quantity: 4 },
                { productId: water.id, quantity: 2 },
            ],
            payments: [{ method: "Cash", amount: 2600 }],
        })
        const id = newId()
        const at = new Date()
        const mirror: NewLedgerDocument = {
            id,
            type: "VOID",
            occurredAt: at,
            recordedAt: at,
            performedBy: boss.id,
            linkedDocumentId: target.id,
            notes: null,
            agreements: target.agreements.map((row) => ({
                id: newId(),
                documentId: id,
                productId: row.productId,
                linkedAgreementId: row.id,
                quantity: -row.quantity,
                unitPrice: null,
                lineDiscount: null,
                documentDiscountShare: null,
                value: -row.value,
            })),
            movements: target.movements.map((row) => ({
                id: newId(),
                documentId: id,
                productId: row.productId,
                linkedMovementId: row.id,
                quantity: -row.quantity,
            })),
            payments: target.payments.map((row) => ({
                id: newId(),
                documentId: id,
                linkedPaymentId: row.id,
                method: row.method,
                amount: -row.amount,
            })),
        }

        // The mirror as built is accepted
        expect(() => checkInContext(mirror)).not.toThrow()

        // The goods come back but the money owed does not
        expect(() =>
            checkInContext({
                ...mirror,
                agreements: mirror.agreements.map((row, position) =>
                    position === 0 ? { ...row, value: 0 } : row,
                ),
            }),
        ).toThrow(/agreement .* must be taken back in full/)

        // Only half the units come back
        expect(() =>
            checkInContext({
                ...mirror,
                movements: mirror.movements.map((row) => ({ ...row, quantity: row.quantity - 1 })),
            }),
        ).toThrow(/movement .* must be taken back in full/)

        // The right quantity, for the wrong product
        expect(() =>
            checkInContext({
                ...mirror,
                movements: [
                    { ...mirror.movements[0], productId: mirror.movements[1].productId },
                    mirror.movements[1],
                ],
            }),
        ).toThrow(/must be taken back for the same product/)

        // A payment left behind
        expect(() => checkInContext({ ...mirror, payments: [] })).toThrow(
            /A void must take back all 1 payment\(s\) of .*, not 0/,
        )

        // The same row taken back twice
        expect(() =>
            checkInContext({
                ...mirror,
                agreements: [mirror.agreements[0], { ...mirror.agreements[0], id: newId() }],
            }),
        ).toThrow(/must be taken back exactly once/)
    })
})
