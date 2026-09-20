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
    discounts: ColumnSpec
    amount: ColumnSpec
    cost: ColumnSpec
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
    /** The salesman who performed it. */
    salesman: Reference
    /** The products its lines move: reversals may touch deactivated ones. */
    products: Reference
    /** `linked_document_id`: set exactly for the types that reverse or settle another. */
    linkedDocument: Requirement
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
        checks: ["discountsWithinGross", "amountMatchesLine"],
        salesman: "active",
        products: "active",
        linkedDocument: "forbidden",
        lines: {
            minimum: 1,
            quantity: "negative",
            link: "forbidden",
            unitPrice: { presence: "required", sign: "nonNegative" },
            discounts: { presence: "required", sign: "nonNegative" },
            // Never below zero, which `discountsWithinGross` says with the reason
            amount: { presence: "required", sign: "any" },
            cost: { presence: "forbidden", sign: "any" },
        },
        payments: { minimum: 0, sign: "positive", link: "forbidden" },
    },
    RETURN: {
        checks: [],
        salesman: "active",
        products: "any",
        linkedDocument: "required",
        lines: {
            minimum: 1,
            quantity: "positive",
            link: "required",
            unitPrice: { presence: "forbidden", sign: "any" },
            discounts: { presence: "forbidden", sign: "any" },
            amount: { presence: "required", sign: "nonPositive" },
            cost: { presence: "forbidden", sign: "any" },
        },
        payments: { minimum: 0, sign: "negative", link: "optional" },
    },
    CREDIT_PAYMENT: {
        checks: [],
        salesman: "active",
        products: "any",
        linkedDocument: "required",
        lines: null,
        payments: { minimum: 1, sign: "positive", link: "forbidden" },
    },
    RESTOCK: {
        checks: ["costEqualsPayments"],
        salesman: "active",
        products: "active",
        linkedDocument: "forbidden",
        lines: {
            minimum: 1,
            quantity: "positive",
            link: "forbidden",
            unitPrice: { presence: "forbidden", sign: "any" },
            discounts: { presence: "forbidden", sign: "any" },
            amount: { presence: "forbidden", sign: "any" },
            cost: { presence: "required", sign: "nonNegative" },
        },
        payments: { minimum: 0, sign: "negative", link: "forbidden" },
    },
    WRITE_OFF: {
        checks: [],
        salesman: "active",
        products: "active",
        linkedDocument: "forbidden",
        lines: {
            minimum: 1,
            quantity: "negative",
            link: "forbidden",
            unitPrice: { presence: "forbidden", sign: "any" },
            discounts: { presence: "forbidden", sign: "any" },
            amount: { presence: "forbidden", sign: "any" },
            cost: { presence: "forbidden", sign: "any" },
        },
        payments: null,
    },
    VOID: {
        checks: [],
        salesman: "active",
        products: "any",
        linkedDocument: "required",
        lines: {
            minimum: 0,
            quantity: "nonZero",
            link: "required",
            unitPrice: { presence: "forbidden", sign: "any" },
            discounts: { presence: "forbidden", sign: "any" },
            // Filled only when reversing a sale line, which the original says
            amount: { presence: "optional", sign: "any" },
            cost: { presence: "forbidden", sign: "any" },
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
     * What goods cost is what was paid for them: a restock's payments cover its
     * lines exactly, so goods that came in free have no payments.
     */
    costEqualsPayments(doc: NewLedgerDocument): void {
        const cost = doc.lines.reduce((sum, line) => sum + (line.cost ?? 0), 0)
        const paid = -doc.payments.reduce((sum, payment) => sum + payment.amount, 0)
        if (cost !== paid) {
            throw new RuleViolationError(
                `A ${doc.type} must be paid in full: cost ${cost}, paid ${paid}`,
            )
        }
    },

    /**
     * Nothing is sold for less than free: the discounts on a line cannot exceed
     * what that line is worth at the catalog price.
     */
    discountsWithinGross(doc: NewLedgerDocument): void {
        for (const line of doc.lines) {
            const gross = Math.abs(line.quantity) * (line.unitPrice ?? 0)
            const discount = (line.itemDiscount ?? 0) + (line.globalDiscount ?? 0)
            if (discount > gross) {
                throw new RuleViolationError(
                    `Discounts of ${discount} are larger than the ${gross} being sold`,
                )
            }
        }
    },

    /**
     * The amount is what was charged: the price times the quantity, less the
     * discounts.
     */
    amountMatchesLine(doc: NewLedgerDocument): void {
        for (const line of doc.lines) {
            const gross = Math.abs(line.quantity) * (line.unitPrice ?? 0)
            const expected = gross - (line.itemDiscount ?? 0) - (line.globalDiscount ?? 0)
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

    checkSalesman(references.salesmanId, context, spec.salesman)
    for (const productId of references.productIds) {
        checkProduct(productId, context, spec.products)
    }
    if (references.linkedDocumentId && !context.linked.getDocument(references.linkedDocumentId)) {
        throw new NotFoundError(`Unknown document: ${references.linkedDocumentId}`)
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
            salesmanId: doc.salesmanId,
            productIds: doc.lines.map((line) => line.productId),
            linkedDocumentId: doc.linkedDocumentId,
        },
        context,
    )
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
        checkColumn("item discount", line.itemDiscount, spec.discounts, doc.type)
        checkColumn("global discount", line.globalDiscount, spec.discounts, doc.type)
        checkColumn("amount", line.amount, spec.amount, doc.type)
        checkColumn("cost", line.cost, spec.cost, doc.type)
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
