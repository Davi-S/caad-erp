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
 * Which rows a document carries. `null` means the document has none of that kind.
 */
export interface Shape {
    terms: TermsShape | null
    movements: MovementsShape | null
    payments: PaymentsShape | null
}

/** Goods sold: they leave, and the customer owes their value. */
const SELL_TERMS: TermsShape = {
    minimum: 1,
    linkedTermsId: "forbidden",
    quantity: "negative",
    value: "nonNegative",
    unitPrice: "required",
    lineDiscount: "required",
    documentDiscountShare: "required",
}

/** Goods bought: they arrive, and the supplier is owed their cost. */
const BUY_TERMS: TermsShape = {
    minimum: 1,
    linkedTermsId: "forbidden",
    quantity: "positive",
    value: "nonPositive",
    unitPrice: "forbidden",
    lineDiscount: "forbidden",
    documentDiscountShare: "forbidden",
}

const GOODS_OUT: MovementsShape = {
    minimum: 1,
    linkedMovementId: "forbidden",
    quantity: "negative",
}
const GOODS_IN: MovementsShape = {
    minimum: 1,
    linkedMovementId: "forbidden",
    quantity: "positive",
}
/**
 * Money moving beside goods, at the counter. A deal is worth something and is
 * settled now, so there is always at least one payment; whether they add up to
 * the deal is `settledInFull`'s business.
 */
const MONEY_IN: PaymentsShape = { minimum: 1, sign: "positive", linkedPaymentId: "forbidden" }
const MONEY_OUT: PaymentsShape = { minimum: 1, sign: "negative", linkedPaymentId: "forbidden" }

/**
 * The shapes, named for what they do. Deferral is the absence of the rows that
 * have not happened yet: a credit sale has no payments, a pre-paid sale has no
 * movements.
 */
const SHAPES = {
    sellNow: { terms: SELL_TERMS, movements: GOODS_OUT, payments: MONEY_IN },
    sellOnCredit: { terms: SELL_TERMS, movements: GOODS_OUT, payments: null },

    buyNow: { terms: BUY_TERMS, movements: GOODS_IN, payments: MONEY_OUT },

    /** Goods leave with nobody on the other side. */
    goodsOutOnly: { terms: null, movements: GOODS_OUT, payments: null },

    /** A document that exists only to move money carries at least one payment. */
    moneyInOnly: {
        terms: null,
        movements: null,
        payments: { minimum: 1, sign: "positive", linkedPaymentId: "forbidden" },
    },

    /** A void carries whatever its target carries, negated; the mirror rule checks it. */
    mirror: {
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
    },
} as const satisfies Record<string, Shape>

/** What a document needs of a record it names. */
export type Reference = "active" | "exists" | "any"

export interface DocumentSpec {
    shape: Shape
    /** Rules of this type that are code rather than a table entry; see `CHECKS`. */
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
        shape: SHAPES.sellNow,
        checks: ["valueMatchesPricing", "dealHasValue", "settledInFull"],
        contextChecks: ["movementsWithinTerms"],
        salesman: "active",
        products: "active",
        linkedTypes: null,
    },
    CREDIT_SALE: {
        shape: SHAPES.sellOnCredit,
        checks: ["valueMatchesPricing", "dealHasValue"],
        contextChecks: ["movementsWithinTerms"],
        salesman: "active",
        products: "active",
        linkedTypes: null,
    },

    RESTOCK: {
        shape: SHAPES.buyNow,
        checks: ["dealHasValue", "settledInFull"],
        contextChecks: ["movementsWithinTerms"],
        salesman: "active",
        products: "active",
        linkedTypes: null,
    },

    WRITE_OFF: {
        shape: SHAPES.goodsOutOnly,
        checks: [],
        contextChecks: [],
        salesman: "active",
        // Leftovers of a product that is no longer sold still have to be cleared
        products: "exists",
        linkedTypes: null,
    },

    PAYMENT_IN: {
        shape: SHAPES.moneyInOnly,
        checks: [],
        contextChecks: ["targetNotVoided"],
        salesman: "active",
        products: "any",
        linkedTypes: ["CREDIT_SALE"],
    },

    VOID: {
        shape: SHAPES.mirror,
        checks: ["happensWhenRecorded"],
        contextChecks: ["targetIsVoidable", "mirrorsTargetWhole"],
        salesman: "active",
        products: "any",
        // Anything but another void: an unwanted void is undone by recording the
        // original again
        linkedTypes: ["SALE", "CREDIT_SALE", "RESTOCK", "WRITE_OFF", "PAYMENT_IN"],
    },
}
