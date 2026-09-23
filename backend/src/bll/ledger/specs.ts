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
export type Presence = "required" | "forbidden"

/** What a document agrees: goods promised and what they are worth. */
export interface AgreementsShape {
    /** How many rows of this kind the document needs. */
    minimum: number
    /** Only a reversal points at what it takes back. */
    linkedAgreementId: Presence
    quantity: Sign
    value: Sign
    /**
     * The three pricing columns. They almost always agree - a sale prices its
     * goods, a purchase and a reversal do not - and they are stated one by one so
     * that a type can ever differ without the engine changing.
     */
    unitPrice: Presence
    lineDiscount: Presence
    documentDiscountShare: Presence
}

/** Goods that actually moved. */
export interface MovementsShape {
    minimum: number
    /** Only a reversal points at what it takes back. */
    linkedMovementId: Presence
    quantity: Sign
}

/** Money that actually moved. */
export interface PaymentsShape {
    minimum: number
    sign: Sign
    /** A void's payments name the payment they cancel. */
    linkedPaymentId: Presence
}

/**
 * Which rows a document carries, and what follows from carrying them. `null`
 * means the document has none of that kind.
 *
 * The checks here belong to the form, not to any one intent: a document that
 * agrees goods and pays for them now must be settled now, whichever intent it is.
 */
export interface Shape {
    agreements: AgreementsShape | null
    movements: MovementsShape | null
    payments: PaymentsShape | null
    checks: CheckName[]
}

/** Goods going out: they leave, and their value is owed to us. Priced. */
const GOODS_OUT_AGREEMENTS: AgreementsShape = {
    minimum: 1,
    linkedAgreementId: "forbidden",
    quantity: "negative",
    value: "nonNegative",
    unitPrice: "required",
    lineDiscount: "required",
    documentDiscountShare: "required",
}

/** Goods coming in: they arrive, and their cost is owed by us. Not priced. */
const GOODS_IN_AGREEMENTS: AgreementsShape = {
    minimum: 1,
    linkedAgreementId: "forbidden",
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
 * Money arriving, and money leaving. An agreement that is settled carries at
 * least one payment; whether they add up to it is `paymentsSettleInFull`'s
 * business.
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
 * when they happen. What was agreed is always recorded, so nothing about the
 * agreement waits.
 */
const SHAPES = {
    moneyIn: { agreements: null, movements: null, payments: MONEY_IN_PAYMENTS, checks: [] },

    // Note that some agreed items can be free, but the total cannot be free
    moneyInGoodsOut: {
        agreements: GOODS_OUT_AGREEMENTS,
        movements: GOODS_OUT_MOVEMENTS,
        payments: MONEY_IN_PAYMENTS,
        checks: [
            "agreementValueMatchesPricing",
            "agreementsHaveValue",
            "movementsWithinAgreements",
            "paymentsSettleInFull",
        ],
    },

    // Note that some agreed items can be free, but the total cannot be free
    moneyInGoodsDeferred: {
        agreements: GOODS_OUT_AGREEMENTS,
        movements: null,
        payments: MONEY_IN_PAYMENTS,
        checks: ["agreementValueMatchesPricing", "agreementsHaveValue", "paymentsSettleInFull"],
    },

    goodsIn: { agreements: null, movements: GOODS_IN_MOVEMENTS, payments: null, checks: [] },

    goodsOut: { agreements: null, movements: GOODS_OUT_MOVEMENTS, payments: null, checks: [] },

    // Note that some agreed items can be free, but the total cannot be free
    moneyOutGoodsIn: {
        agreements: GOODS_IN_AGREEMENTS,
        movements: GOODS_IN_MOVEMENTS,
        payments: MONEY_OUT_PAYMENTS,
        checks: ["agreementsHaveValue", "movementsWithinAgreements", "paymentsSettleInFull"],
    },

    moneyOut: { agreements: null, movements: null, payments: MONEY_OUT_PAYMENTS, checks: [] },

    // Note that some agreed items can be free, but the total cannot be free
    moneyOutGoodsDeferred: {
        agreements: GOODS_IN_AGREEMENTS,
        movements: null,
        payments: MONEY_OUT_PAYMENTS,
        checks: ["agreementsHaveValue", "paymentsSettleInFull"],
    },

    // Note that some agreed items can be free, but the total cannot be free
    moneyDeferredGoodsOut: {
        agreements: GOODS_OUT_AGREEMENTS,
        movements: GOODS_OUT_MOVEMENTS,
        payments: null,
        checks: [
            "agreementValueMatchesPricing",
            "agreementsHaveValue",
            "movementsWithinAgreements",
        ],
    },

    // Note that some agreed items can be free, but the total cannot be free
    moneyDeferredGoodsIn: {
        agreements: GOODS_IN_AGREEMENTS,
        movements: GOODS_IN_MOVEMENTS,
        payments: null,
        checks: ["agreementsHaveValue", "movementsWithinAgreements"],
    },

    /**
     * Not one of the ten: a void carries whatever its target carries, negated, so
     * its rows are whatever they have to be and the mirror rule checks them.
     */
    mirrored: {
        agreements: {
            minimum: 0,
            linkedAgreementId: "required",
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
export type ReferenceRule = "active" | "exists" | "any"

export interface DocumentSpec {
    shape: Shape
    /** Rules of this intent alone; what follows from its form is on the shape. */
    checks: CheckName[]
    /** The same, for rules that need the documents around it; see `CONTEXT_CHECKS`. */
    contextChecks: ContextCheckName[]
    /** Whoever performed it. */
    salesman: ReferenceRule
    /** The products it names: reversals may touch deactivated ones. */
    products: ReferenceRule
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
        checks: ["occursWhenRecorded"],
        contextChecks: ["targetIsVoidable", "targetFullyMirrored"],
        salesman: "active",
        products: "any",
        // Anything but another void: an unwanted void is undone by recording the
        // original again
        linkedTypes: ["SALE", "CREDIT_SALE", "RESTOCK", "WRITE_OFF", "PAYMENT_IN"],
    },
}
