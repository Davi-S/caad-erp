/**
 * The rules every document must satisfy on its own.
 *
 * These describe the shape of each document type: which links, lines and payments
 * it has, which columns those fill, and which signs the numbers carry. They look
 * at one document only, so they can be checked before it is stored and, later,
 * re-checked over stored data.
 *
 * These are invariants of a stored document, not of a request: they hold whoever
 * built it, so they also catch a command that builds a row wrongly (a forgotten
 * minus sign). Input checks do not replace them, and they do not replace input
 * checks: nothing here checks blank text or missing fields.
 *
 * `validateInContext` covers the rules about what a document refers to: its
 * salesman, the products its lines move, and the document it links to. It takes
 * those records as data, loaded by `context.ts`, so it stays as pure as the rest.
 * The foreign keys in the database only stop a dangling row from being stored;
 * they are not what produces the error.
 *
 * Rules that weigh a document against a whole tree of others (over-reversal, sale
 * balance, dependencies) are not expressible as a spec entry and will live beside
 * these as code reading the same context.
 */

import { paymentMethodValues } from "../../dal/index.js"
import type { DocumentType, NewLedgerDocument } from "../../dal/index.js"
import { InactiveError, NotFoundError, RuleViolationError } from "../errors.js"
import type { DocumentReferences, LedgerContext } from "./context.js"

/** Whether a nullable column must, must not, or may carry a value. */
type Requirement = "required" | "forbidden" | "optional"

/** What a document needs of a record it names. */
type Reference = "active" | "exists" | "any"

/** Which values a number may take, on top of always being a whole number. */
type Sign = "positive" | "negative" | "nonNegative" | "nonPositive" | "nonZero" | "any"

/** Whether a nullable column carries a value, and which values it may take. */
interface ColumnSpec {
    presence: Requirement
    sign: Sign
}

interface LineSpec {
    /** How many lines the document needs. */
    minimum: number
    quantity: Sign
    /** `linked_line_id`: reversal lines point at the line they reverse. */
    link: Requirement
    unitPrice: ColumnSpec
    lineDiscount: ColumnSpec
    documentDiscountShare: ColumnSpec
    amount: ColumnSpec
    totalCost: ColumnSpec
}

interface PaymentSpec {
    minimum: number
    sign: Sign
    /** `linked_payment_id`: a void's payments point at the payment they cancel. */
    link: Requirement
}

interface DocumentSpec {
    /** Rules of this type that are code rather than a table entry; see `CHECKS`. */
    checks: CheckName[]
    /** The same, for rules that need what the document points at; see `CONTEXT_CHECKS`. */
    contextChecks: ContextCheckName[]
    /** The salesman who performed it. */
    salesman: Reference
    /** The products its lines move: reversals may touch deactivated ones. */
    products: Reference
    /** `linked_document_id`: set exactly for the types that reverse or settle another. */
    linkedDocument: Requirement
    /** Which types it may link to; `null` when it links to none. */
    linkedTypes: DocumentType[] | null
    /** `null` when the type has no lines at all. */
    lines: LineSpec | null
    /** `null` when the type has no payments at all. */
    payments: PaymentSpec | null
}

/**
 * One entry per document type, mirroring the document shapes in REQUIREMENTS.md.
 *
 * Reversal lines (`RETURN`, `VOID`) carry only quantity and amount: their price,
 * discounts and cost are read from the line they reverse.
 */
const SPECS: Record<DocumentType, DocumentSpec> = {
    SALE: {
        checks: ["amountMatchesLine"],
        contextChecks: [],
        salesman: "active",
        products: "active",
        linkedDocument: "forbidden",
        linkedTypes: null,
        lines: {
            minimum: 1,
            quantity: "negative",
            link: "forbidden",
            unitPrice: { presence: "required", sign: "nonNegative" },
            lineDiscount: { presence: "required", sign: "nonNegative" },
            documentDiscountShare: { presence: "required", sign: "nonNegative" },
            amount: { presence: "required", sign: "nonNegative" },
            totalCost: { presence: "forbidden", sign: "any" },
        },
        payments: { minimum: 0, sign: "positive", link: "forbidden" },
    },
    RETURN: {
        checks: [],
        contextChecks: [],
        salesman: "active",
        products: "any",
        linkedDocument: "required",
        linkedTypes: ["SALE"],
        lines: {
            minimum: 1,
            quantity: "positive",
            link: "required",
            unitPrice: { presence: "forbidden", sign: "any" },
            lineDiscount: { presence: "forbidden", sign: "any" },
            documentDiscountShare: { presence: "forbidden", sign: "any" },
            amount: { presence: "required", sign: "nonPositive" },
            totalCost: { presence: "forbidden", sign: "any" },
        },
        payments: { minimum: 0, sign: "negative", link: "optional" },
    },
    PAYMENT: {
        checks: [],
        // Money settled later: its direction follows the document it settles
        contextChecks: ["targetNotVoided", "paymentsMatchTargetDirection"],
        salesman: "active",
        products: "any",
        linkedDocument: "required",
        // Anything that moves money can be settled later
        linkedTypes: ["SALE", "RESTOCK", "RETURN"],
        lines: null,
        payments: { minimum: 1, sign: "nonZero", link: "forbidden" },
    },
    RESTOCK: {
        checks: [],
        contextChecks: [],
        salesman: "active",
        products: "active",
        linkedDocument: "forbidden",
        linkedTypes: null,
        lines: {
            minimum: 1,
            quantity: "positive",
            link: "forbidden",
            unitPrice: { presence: "forbidden", sign: "any" },
            lineDiscount: { presence: "forbidden", sign: "any" },
            documentDiscountShare: { presence: "forbidden", sign: "any" },
            amount: { presence: "forbidden", sign: "any" },
            totalCost: { presence: "required", sign: "nonNegative" },
        },
        payments: { minimum: 0, sign: "negative", link: "forbidden" },
    },
    WRITE_OFF: {
        checks: [],
        contextChecks: [],
        salesman: "active",
        products: "active",
        linkedDocument: "forbidden",
        linkedTypes: null,
        lines: {
            minimum: 1,
            quantity: "negative",
            link: "forbidden",
            unitPrice: { presence: "forbidden", sign: "any" },
            lineDiscount: { presence: "forbidden", sign: "any" },
            documentDiscountShare: { presence: "forbidden", sign: "any" },
            amount: { presence: "forbidden", sign: "any" },
            totalCost: { presence: "forbidden", sign: "any" },
        },
        payments: null,
    },
    VOID: {
        checks: ["happenedWhenRecorded"],
        contextChecks: ["reversesTargetWhole", "targetIsVoidable"],
        salesman: "active",
        products: "any",
        linkedDocument: "required",
        // Anything but another void: an unwanted void is undone by recording the
        // original again
        linkedTypes: ["SALE", "RETURN", "PAYMENT", "RESTOCK", "WRITE_OFF"],
        lines: {
            minimum: 0,
            quantity: "nonZero",
            link: "required",
            unitPrice: { presence: "forbidden", sign: "any" },
            lineDiscount: { presence: "forbidden", sign: "any" },
            documentDiscountShare: { presence: "forbidden", sign: "any" },
            // Filled only when reversing a sale line, which the original says
            amount: { presence: "optional", sign: "any" },
            totalCost: { presence: "forbidden", sign: "any" },
        },
        payments: { minimum: 0, sign: "nonZero", link: "required" },
    },
}

/**
 * The rules that cannot be said in a table entry: each one reads a whole document
 * and throws if it is wrong. A type applies the ones its spec names.
 */
const CHECKS = {
    /**
     * A correction is made now: it does not get a business time of its own, since
     * what it takes back keeps the original's.
     */
    happenedWhenRecorded(doc: NewLedgerDocument): void {
        if (doc.occurredAt.getTime() !== doc.recordedAt.getTime()) {
            throw new RuleViolationError(`A ${doc.type} happens when it is recorded`)
        }
    },

    /**
     * The amount is what was charged: the price times the quantity, less the
     * discounts.
     */
    amountMatchesLine(doc: NewLedgerDocument): void {
        for (const line of doc.lines) {
            const gross = Math.abs(line.quantity) * (line.unitPrice ?? 0)
            const expected = gross - (line.lineDiscount ?? 0) - (line.documentDiscountShare ?? 0)
            if (line.amount !== expected) {
                throw new RuleViolationError(
                    `Line amount ${line.amount} does not match price and discounts (expected ${expected})`,
                )
            }
        }
    },
}

type CheckName = keyof typeof CHECKS

/**
 * The rules that need what the document points at. A type applies the ones its
 * spec names.
 */
const CONTEXT_CHECKS = {
    /**
     * A void takes back the whole document: every line and every payment, each in
     * full, and each pointing at the row it reverses. Taking back only part of
     * something is a new business fact, which is what a return is for.
     */
    reversesTargetWhole(doc: NewLedgerDocument, context: LedgerContext): void {
        const target = context.linked.getDocument(doc.linkedDocumentId!)!

        checkMirrors(
            doc.lines.map((line) => ({ of: line.linkedLineId, by: line.quantity })),
            target.lines.map((line) => ({ id: line.id, value: line.quantity })),
            "line",
            target.id,
        )
        checkMirrors(
            doc.payments.map((payment) => ({ of: payment.linkedPaymentId, by: payment.amount })),
            target.payments.map((payment) => ({ id: payment.id, value: payment.amount })),
            "payment",
            target.id,
        )
    },

    /**
     * What hangs off a document is dealt with first: a document with a live
     * return or payment on it cannot be voided until that is voided too.
     *
     * A document is voided or it is not, so a second void has nothing left to
     * take back.
     */
    targetIsVoidable(doc: NewLedgerDocument, context: LedgerContext): void {
        const target = context.linked.getDocument(doc.linkedDocumentId!)!

        for (const dependent of context.linked.linkedDocuments(target.id)) {
            if (dependent.type === "VOID") {
                throw new RuleViolationError(`${target.id} is already voided`)
            }
            const voided = context.linked
                .linkedDocuments(dependent.id)
                .some((other) => other.type === "VOID")
            if (!voided) {
                throw new RuleViolationError(
                    `${target.id} has a ${dependent.type} on it; void that first`,
                )
            }
        }
    },

    /**
     * Nothing is settled against an entry that never happened.
     */
    targetNotVoided(doc: NewLedgerDocument, context: LedgerContext): void {
        const target = context.linked.getDocument(doc.linkedDocumentId!)!
        const voided = context.linked
            .linkedDocuments(target.id)
            .some((other) => other.type === "VOID")
        if (voided) {
            throw new RuleViolationError(`${target.id} is voided`)
        }
    },

    /**
     * Money settled later moves the same way as the document it settles: into the
     * till for a sale, out of it for a restock or a refund.
     */
    paymentsMatchTargetDirection(doc: NewLedgerDocument, context: LedgerContext): void {
        const target = context.linked.getDocument(doc.linkedDocumentId!)!
        const direction = paymentDirection(target.type)
        if (direction === 0) {
            throw new RuleViolationError(`A ${target.type} takes no payments`)
        }
        for (const payment of doc.payments) {
            if (Math.sign(payment.amount) !== direction) {
                throw new RuleViolationError(
                    `Money settling a ${target.type} moves ${direction > 0 ? "in" : "out"}, not the other way`,
                )
            }
        }
    },
}

type ContextCheckName = keyof typeof CONTEXT_CHECKS

/**
 * Which way money moves on a document of this type: `1` into the till, `-1` out
 * of it.
 *
 * Read from the same table the rules read, so a command building a payment and
 * the rule checking it cannot disagree.
 *
 * @param type - The type whose money direction is wanted.
 * @returns The direction, or `0` when the type takes no payments.
 */
export function paymentDirection(type: DocumentType): number {
    const sign = SPECS[type].payments?.sign
    if (sign === "positive") {
        return 1
    }
    return sign === "negative" ? -1 : 0
}

/**
 * Checks a document against the shape of its type.
 *
 * @param doc - Document with its lines and payments, as it will be stored.
 * @throws {@link RuleViolationError} If any rule is broken.
 */
export function validateDocument(doc: NewLedgerDocument): void {
    const spec = SPECS[doc.type]

    if (doc.occurredAt.getTime() > doc.recordedAt.getTime()) {
        throw new RuleViolationError("A document cannot have happened after it was recorded")
    }

    checkLink("linked document", doc.id, doc.linkedDocumentId, spec.linkedDocument, doc.type)

    checkLines(doc, spec.lines)
    checkPayments(doc, spec.payments)

    for (const check of spec.checks) {
        CHECKS[check](doc)
    }
}

/**
 * Checks what a document is about to refer to, before it is built.
 *
 * @param references - The records it will point at.
 * @param context - What they resolved to, from {@link loadContext}.
 * @throws {@link NotFoundError} If a reference names nothing.
 * @throws {@link InactiveError} If it names something inactive that must be active.
 */
export function validateReferences(references: DocumentReferences, context: LedgerContext): void {
    const spec = SPECS[references.type]

    checkSalesman(references.performedBy, context, spec.salesman)
    for (const productId of references.productIds) {
        checkProduct(productId, context, spec.products)
    }
    if (references.linkedDocumentId) {
        const target = context.linked.getDocument(references.linkedDocumentId)
        if (!target) {
            throw new NotFoundError(`Unknown document: ${references.linkedDocumentId}`)
        }
        if (spec.linkedTypes && !spec.linkedTypes.includes(target.type)) {
            throw new RuleViolationError(
                `A ${references.type} cannot be linked to a ${target.type}`,
            )
        }
    }
}

/**
 * Checks a document against the records it refers to.
 *
 * @param doc - Document with its lines and payments, as it will be stored.
 * @param context - What those references resolved to, from {@link loadContext}.
 * @throws {@link NotFoundError} If a reference names nothing.
 * @throws {@link InactiveError} If it names something inactive that must be active.
 * @throws {@link RuleViolationError} If any other rule is broken.
 */
export function validateInContext(doc: NewLedgerDocument, context: LedgerContext): void {
    validateReferences(
        {
            type: doc.type,
            performedBy: doc.performedBy,
            productIds: doc.lines.map((line) => line.productId),
            linkedDocumentId: doc.linkedDocumentId,
        },
        context,
    )

    for (const check of SPECS[doc.type].contextChecks) {
        CONTEXT_CHECKS[check](doc, context)
    }
}

/**
 * Every row of the target is taken back exactly once, by its own negation.
 */
function checkMirrors(
    reversals: { of: string | null; by: number }[],
    originals: { id: string; value: number }[],
    what: string,
    targetId: string,
): void {
    if (reversals.length !== originals.length) {
        throw new RuleViolationError(
            `A void must take back all ${originals.length} ${what}(s) of ${targetId}, not ${reversals.length}`,
        )
    }

    for (const original of originals) {
        const mirrors = reversals.filter((reversal) => reversal.of === original.id)
        if (mirrors.length !== 1) {
            throw new RuleViolationError(`${what} ${original.id} must be taken back exactly once`)
        }
        if (mirrors[0].by !== -original.value) {
            throw new RuleViolationError(`${what} ${original.id} must be taken back in full`)
        }
    }
}

function checkSalesman(salesmanId: string, context: LedgerContext, reference: Reference): void {
    if (reference === "any") {
        return
    }
    if (!context.salesman) {
        throw new NotFoundError(`Unknown salesman: ${salesmanId}`)
    }
    if (reference === "active" && !context.salesman.isActive) {
        throw new InactiveError(`Salesman '${context.salesman.name}' is inactive`)
    }
}

function checkProduct(productId: string, context: LedgerContext, reference: Reference): void {
    if (reference === "any") {
        return
    }
    const product = context.products.get(productId)
    if (!product) {
        throw new NotFoundError(`Unknown product: ${productId}`)
    }
    if (reference === "active" && !product.isActive) {
        throw new InactiveError(`Product '${product.name}' is inactive`)
    }
}

function checkLines(doc: NewLedgerDocument, spec: LineSpec | null): void {
    if (!spec) {
        if (doc.lines.length > 0) {
            throw new RuleViolationError(`A ${doc.type} cannot have lines`)
        }
        return
    }
    if (doc.lines.length < spec.minimum) {
        throw new RuleViolationError(`A ${doc.type} needs at least ${spec.minimum} line(s)`)
    }

    for (const line of doc.lines) {
        checkNumber("Line quantity", line.quantity, spec.quantity)
        checkLink("linked line", line.id, line.linkedLineId, spec.link, doc.type)

        checkColumn("unit price", line.unitPrice, spec.unitPrice, doc.type)
        checkColumn("line discount", line.lineDiscount, spec.lineDiscount, doc.type)
        checkColumn(
            "document discount share",
            line.documentDiscountShare,
            spec.documentDiscountShare,
            doc.type,
        )
        checkColumn("amount", line.amount, spec.amount, doc.type)
        checkColumn("total cost", line.totalCost, spec.totalCost, doc.type)
    }
}

function checkPayments(doc: NewLedgerDocument, spec: PaymentSpec | null): void {
    if (!spec) {
        if (doc.payments.length > 0) {
            throw new RuleViolationError(`A ${doc.type} cannot have payments`)
        }
        return
    }
    if (doc.payments.length < spec.minimum) {
        throw new RuleViolationError(`A ${doc.type} needs at least ${spec.minimum} payment(s)`)
    }

    for (const payment of doc.payments) {
        if (!(paymentMethodValues as readonly string[]).includes(payment.method)) {
            throw new RuleViolationError(`Unknown payment method: ${payment.method}`)
        }
        checkNumber("Payment amount", payment.amount, spec.sign)
        checkLink("linked payment", payment.id, payment.linkedPaymentId, spec.link, doc.type)
    }
}

function checkLink(
    what: string,
    ownerId: string,
    value: string | null,
    requirement: Requirement,
    type: DocumentType,
): void {
    if (requirement === "required" && value === null) {
        throw new RuleViolationError(`A ${type} must have a ${what}`)
    }
    if (requirement === "forbidden" && value !== null) {
        throw new RuleViolationError(`A ${type} cannot have a ${what}`)
    }
    if (value === ownerId) {
        throw new RuleViolationError(`A ${what} cannot point at itself`)
    }
}

function checkColumn(
    what: string,
    value: number | null,
    spec: ColumnSpec,
    type: DocumentType,
): void {
    if (spec.presence === "required" && value === null) {
        throw new RuleViolationError(`A ${type} line must have a ${what}`)
    }
    if (spec.presence === "forbidden" && value !== null) {
        throw new RuleViolationError(`A ${type} line cannot have a ${what}`)
    }
    if (value !== null) {
        checkNumber(`Line ${what}`, value, spec.sign)
    }
}

function checkNumber(what: string, value: number, sign: Sign): void {
    if (!Number.isInteger(value)) {
        throw new RuleViolationError(`${what} must be a whole number of units or cents`)
    }

    const ok = {
        positive: value > 0,
        negative: value < 0,
        nonNegative: value >= 0,
        nonPositive: value <= 0,
        nonZero: value !== 0,
        any: true,
    }[sign]

    if (!ok) {
        throw new RuleViolationError(`${what} ${value} is not allowed here`)
    }
}
