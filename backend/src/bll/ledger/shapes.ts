/**
 * The forms a document can take, and the vocabulary an intent is written in.
 *
 * Two layers. A **shape** says which rows a document carries and which way they
 * point: does it agree anything, do goods move, does money move, and with what
 * signs. An **intent** is the document type itself: what the event means and what
 * it may link to.
 *
 * Several intents share a shape - a customer return moves goods in and money out
 * exactly like a restock - which is why the two are separate. The shape is named
 * by the intent; nothing is ever derived the other way.
 *
 * Each intent states its own spec beside the command that records it, in
 * `commands/`. What every spec draws on lives here, and `rules.ts` is the engine
 * that checks a document against the spec it is handed.
 */

import type { DocumentType } from "../../dal/index.js"
import type { CheckName, ContextCheckName } from "./rules.js"

/** Which values a number may take, on top of always being a whole number. */
export type Sign = "positive" | "negative" | "nonNegative" | "nonPositive" | "nonZero" | "any"

/**
 * Whether a group of nullable columns must or must not carry values.
 *
 * `mirrored` is for a reversal: only the row being taken back says whether the
 * column applies at all - voiding a sale reverses its discounts, voiding a
 * purchase has none to reverse - so the shape defers to `targetFullyMirrored`,
 * which compares the column against the original and is stricter than anything
 * stated here.
 */
export type Presence = "required" | "forbidden" | "mirrored"

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
     * goods, a purchase does not - and they are stated one by one so that a type
     * can ever differ without the engine changing.
     *
     * A reversal carries whatever its target carried, so it states `mirrored`
     * rather than choosing.
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
 * least one payment; whether they add up to it is `paymentsSettleExactly`'s
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
export const SHAPES = {
    moneyIn: { agreements: null, movements: null, payments: MONEY_IN_PAYMENTS, checks: [] },

    // Note that some agreed items can be free, but the total cannot be free
    moneyInGoodsOut: {
        agreements: GOODS_OUT_AGREEMENTS,
        movements: GOODS_OUT_MOVEMENTS,
        payments: MONEY_IN_PAYMENTS,
        checks: [
            "agreementValueMatchesPricing",
            "agreementsHaveValue",
            "movementsMatchAgreements",
            "paymentsSettleExactly",
        ],
    },

    // Note that some agreed items can be free, but the total cannot be free
    moneyInGoodsDeferred: {
        agreements: GOODS_OUT_AGREEMENTS,
        movements: null,
        payments: MONEY_IN_PAYMENTS,
        checks: ["agreementValueMatchesPricing", "agreementsHaveValue", "paymentsSettleExactly"],
    },

    goodsIn: { agreements: null, movements: GOODS_IN_MOVEMENTS, payments: null, checks: [] },

    goodsOut: { agreements: null, movements: GOODS_OUT_MOVEMENTS, payments: null, checks: [] },

    // Note that some agreed items can be free, but the total cannot be free
    moneyOutGoodsIn: {
        agreements: GOODS_IN_AGREEMENTS,
        movements: GOODS_IN_MOVEMENTS,
        payments: MONEY_OUT_PAYMENTS,
        checks: ["agreementsHaveValue", "movementsMatchAgreements", "paymentsSettleExactly"],
    },

    moneyOut: { agreements: null, movements: null, payments: MONEY_OUT_PAYMENTS, checks: [] },

    // Note that some agreed items can be free, but the total cannot be free
    moneyOutGoodsDeferred: {
        agreements: GOODS_IN_AGREEMENTS,
        movements: null,
        payments: MONEY_OUT_PAYMENTS,
        checks: ["agreementsHaveValue", "paymentsSettleExactly"],
    },

    // Note that some agreed items can be free, but the total cannot be free
    moneyDeferredGoodsOut: {
        agreements: GOODS_OUT_AGREEMENTS,
        movements: GOODS_OUT_MOVEMENTS,
        payments: null,
        checks: ["agreementValueMatchesPricing", "agreementsHaveValue", "movementsMatchAgreements"],
    },

    // Note that some agreed items can be free, but the total cannot be free
    moneyDeferredGoodsIn: {
        agreements: GOODS_IN_AGREEMENTS,
        movements: GOODS_IN_MOVEMENTS,
        payments: null,
        checks: ["agreementsHaveValue", "movementsMatchAgreements"],
    },

    /**
     * Not one of the ten: a reversal carries rows that are already stored,
     * negated, so its rows are whatever they have to be and the rules of the
     * intent check them against what they take back.
     *
     * A void takes back a whole document, which `targetFullyMirrored` enforces
     * exactly. A return takes back part of one, so its amounts are a share of the
     * original rather than its negation, and `returnsWithinSold` caps them.
     */
    mirrored: {
        agreements: {
            minimum: 0,
            linkedAgreementId: "required",
            quantity: "nonZero",
            value: "any",
            unitPrice: "mirrored",
            lineDiscount: "mirrored",
            documentDiscountShare: "mirrored",
        },
        movements: { minimum: 0, linkedMovementId: "required", quantity: "nonZero" },
        // A void reverses the payments it takes back and says so; a refund is new
        // money out, possibly by another method, and names no payment of its own.
        // `targetFullyMirrored` is what requires the link where it is required.
        payments: { minimum: 0, sign: "nonZero", linkedPaymentId: "mirrored" },
        checks: [],
    },
} as const satisfies Record<string, Shape>

/** What a document needs of a record it names. */
export type ReferenceRule = "active" | "exists" | "any"

/**
 * What one kind of document is: the form it takes, the rules that come with the
 * intent, and what it is allowed to point at.
 */
export interface DocumentSpec {
    /** The type stored on the document, and the one this spec governs. */
    type: DocumentType
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
