/**
 * What each kind of document is, expressed as data.
 *
 * Two layers. A **shape** says which rows a document carries and which way they
 * point: does it agree anything, do goods move, does money move, and with what
 * signs. An **intent** is the document type itself: what the event means, what it
 * may link to, and which bucket its numbers fall into when reporting.
 *
 * Several intents share a shape - a customer return moves goods in and money out
 * exactly like a restock - which is why the two are separate. The shape is looked
 * up from the intent; nothing is ever derived the other way.
 *
 * `rules.ts` is the engine that checks a document against its entry here.
 */

import type { DocumentType } from "../../dal/index.js"
import type { CheckName, ContextCheckName } from "./rules.js"

/** Which values a number may take, on top of always being a whole number. */
export type Sign = "positive" | "negative" | "nonNegative" | "nonPositive" | "nonZero" | "any"

/** Whether a group of nullable columns must or must not carry values. */
export type Requirement = "required" | "forbidden"

/** What a document agrees: goods promised and what they are worth. */
export interface TermsShape {
    /** How many rows of this kind the document needs. */
    minimum: number
    /** Only a reversal points at what it takes back. */
    linkedTermsId: Requirement
    quantity: Sign
    value: Sign
    /**
     * The three pricing columns. They almost always agree - a sale prices its
     * goods, a purchase and a reversal do not - and they are stated one by one so
     * that a type can ever differ without the engine changing.
     */
    unitPrice: Requirement
    lineDiscount: Requirement
    documentDiscountShare: Requirement
}

/** Goods that actually moved. */
export interface MovementsShape {
    minimum: number
    /** Only a reversal points at what it takes back. */
    linkedMovementId: Requirement
    quantity: Sign
}

/** Money that actually moved. */
export interface PaymentsShape {
    minimum: number
    sign: Sign
    /** A void's payments name the payment they cancel. */
    linkedPaymentId: Requirement
}

/**
 * Which rows a document carries, and what follows from carrying them. `null`
 * means the document has none of that kind.
 *
 * The checks here belong to the form, not to any one intent: a document that
 * agrees goods and pays for them now must be settled now, whichever intent it is.
 */
export interface Shape {
    terms: TermsShape | null
    movements: MovementsShape | null
    payments: PaymentsShape | null
    checks: CheckName[]
}

/** Goods going out: they leave, and their value is owed to us. Priced. */
const GOODS_OUT_TERMS: TermsShape = {
    minimum: 1,
    linkedTermsId: "forbidden",
    quantity: "negative",
    value: "nonNegative",
    unitPrice: "required",
    lineDiscount: "required",
    documentDiscountShare: "required",
}

/** Goods coming in: they arrive, and their cost is owed by us. Not priced. */
const GOODS_IN_TERMS: TermsShape = {
    minimum: 1,
    linkedTermsId: "forbidden",
    quantity: "positive",
    value: "nonPositive",
    unitPrice: "forbidden",
    lineDiscount: "forbidden",
    documentDiscountShare: "forbidden",
}

/** Goods leaving. */
const GOODS_OUT_MOVEMENTS: MovementsShape = {
    minimum: 1,
    linkedMovementId: "forbidden",
    quantity: "negative",
}

/** Goods arriving. */
const GOODS_IN_MOVEMENTS: MovementsShape = {
    minimum: 1,
    linkedMovementId: "forbidden",
    quantity: "positive",
}
/**
 * Money arriving, and money leaving. A deal that is settled carries at least one
 * payment; whether they add up to the deal is `settledInFull`'s business.
 */
const MONEY_IN_PAYMENTS: PaymentsShape = {
    minimum: 1,
    sign: "positive",
    linkedPaymentId: "forbidden",
}

const MONEY_OUT_PAYMENTS: PaymentsShape = {
    minimum: 1,
    sign: "negative",
    linkedPaymentId: "forbidden",
}

/**
 * Every shape there is.
 *
 * A shape says which rows a document carries and which way they point. Money
 * moves one way, goods the other, or only one of the two moves, which gives ten
 * forms and no others. The names describe the movement; what the movement *means*
 * is the intent's business.
 *
 * ```
 *   money       goods       shape
 *   in          -           moneyIn
 *   in          out         moneyInGoodsOut
 *   in          deferred    moneyInGoodsDeferred
 *   -           in          goodsIn
 *   -           out         goodsOut
 *   out         in          moneyOutGoodsIn
 *   out         -           moneyOut
 *   out         deferred    moneyOutGoodsDeferred
 *   deferred    out         moneyDeferredGoodsOut
 *   deferred    in          moneyDeferredGoodsIn
 * ```
 *
 * "Deferred" means the rows are simply absent, and a linked document brings them
 * when they happen. What was agreed is always recorded, so nothing about the deal
 * waits.
 */
const SHAPES = {
    moneyIn: { terms: null, movements: null, payments: MONEY_IN_PAYMENTS, checks: [] },

    moneyInGoodsOut: {
        terms: GOODS_OUT_TERMS,
        movements: GOODS_OUT_MOVEMENTS,
        payments: MONEY_IN_PAYMENTS,
        checks: ["valueMatchesPricing", "dealHasValue", "movementsWithinTerms", "settledInFull"],
    },

    moneyInGoodsDeferred: {
        terms: GOODS_OUT_TERMS,
        movements: null,
        payments: MONEY_IN_PAYMENTS,
        checks: ["valueMatchesPricing", "dealHasValue", "settledInFull"],
    },

    goodsIn: { terms: null, movements: GOODS_IN_MOVEMENTS, payments: null, checks: [] },

    goodsOut: { terms: null, movements: GOODS_OUT_MOVEMENTS, payments: null, checks: [] },

    moneyOutGoodsIn: {
        terms: GOODS_IN_TERMS,
        movements: GOODS_IN_MOVEMENTS,
        payments: MONEY_OUT_PAYMENTS,
        checks: ["dealHasValue", "movementsWithinTerms", "settledInFull"],
    },

    moneyOut: { terms: null, movements: null, payments: MONEY_OUT_PAYMENTS, checks: [] },

    moneyOutGoodsDeferred: {
        terms: GOODS_IN_TERMS,
        movements: null,
        payments: MONEY_OUT_PAYMENTS,
        checks: ["dealHasValue", "settledInFull"],
    },

    moneyDeferredGoodsOut: {
        terms: GOODS_OUT_TERMS,
        movements: GOODS_OUT_MOVEMENTS,
        payments: null,
        checks: ["valueMatchesPricing", "dealHasValue", "movementsWithinTerms"],
    },

    moneyDeferredGoodsIn: {
        terms: GOODS_IN_TERMS,
        movements: GOODS_IN_MOVEMENTS,
        payments: null,
        checks: ["dealHasValue", "movementsWithinTerms"],
    },

    /**
     * Not one of the ten: a void carries whatever its target carries, negated, so
     * its rows are whatever they have to be and the mirror rule checks them.
     */
    mirrored: {
        terms: {
            minimum: 0,
            linkedTermsId: "required",
            quantity: "nonZero",
            value: "any",
            unitPrice: "forbidden",
            lineDiscount: "forbidden",
            documentDiscountShare: "forbidden",
        },
        movements: { minimum: 0, linkedMovementId: "required", quantity: "nonZero" },
        payments: { minimum: 0, sign: "nonZero", linkedPaymentId: "required" },
        checks: [],
    },
} as const satisfies Record<string, Shape>

/** What a document needs of a record it names. */
export type Reference = "active" | "exists" | "any"

export interface DocumentSpec {
    shape: Shape
    /** Rules of this intent alone; what follows from its form is on the shape. */
    checks: CheckName[]
    /** The same, for rules that need the documents around it; see `CONTEXT_CHECKS`. */
    contextChecks: ContextCheckName[]
    /** Whoever performed it. */
    salesman: Reference
    /** The products it names: reversals may touch deactivated ones. */
    products: Reference
    /** Which types it may link to; `null` when it links to none. */
    linkedTypes: DocumentType[] | null
}

/**
 * One entry per document type. Adding a kind of event is a row here plus a
 * command to build it.
 */
export const SPECS: Record<DocumentType, DocumentSpec> = {
    SALE: {
        shape: SHAPES.moneyInGoodsOut,
        checks: [],
        contextChecks: [],
        salesman: "active",
        products: "active",
        linkedTypes: null,
    },
    CREDIT_SALE: {
        shape: SHAPES.moneyDeferredGoodsOut,
        checks: [],
        contextChecks: [],
        salesman: "active",
        products: "active",
        linkedTypes: null,
    },

    RESTOCK: {
        shape: SHAPES.moneyOutGoodsIn,
        checks: [],
        contextChecks: [],
        salesman: "active",
        products: "active",
        linkedTypes: null,
    },

    WRITE_OFF: {
        shape: SHAPES.goodsOut,
        checks: [],
        contextChecks: [],
        salesman: "active",
        // Leftovers of a product that is no longer sold still have to be cleared
        products: "exists",
        linkedTypes: null,
    },

    PAYMENT_IN: {
        shape: SHAPES.moneyIn,
        checks: [],
        contextChecks: ["targetNotVoided"],
        salesman: "active",
        products: "any",
        linkedTypes: ["CREDIT_SALE"],
    },

    VOID: {
        shape: SHAPES.mirrored,
        checks: ["happensWhenRecorded"],
        contextChecks: ["targetIsVoidable", "mirrorsTargetWhole"],
        salesman: "active",
        products: "any",
        // Anything but another void: an unwanted void is undone by recording the
        // original again
        linkedTypes: ["SALE", "CREDIT_SALE", "RESTOCK", "WRITE_OFF", "PAYMENT_IN"],
    },
}
