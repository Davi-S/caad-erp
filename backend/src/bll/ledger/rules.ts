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
 * Rules that compare a document with the rest of the ledger need the surrounding
 * documents and live with the commands that use them: that every link resolves to
 * an existing row of the right kind, over-reversal, sale balance, dependencies.
 * The foreign keys in the database only stop a dangling row from being stored;
 * they are not what produces the error.
 */

import type { DocumentLineRow, DocumentType, NewLedgerDocument } from "../../dal/index.js"
import { RuleViolationError } from "../errors.js"

/** Whether a nullable column must, must not, or may carry a value. */
type Requirement = "required" | "forbidden" | "optional"

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
        linkedDocument: "forbidden",
        lines: {
            minimum: 1,
            quantity: "negative",
            link: "forbidden",
            unitPrice: { presence: "required", sign: "nonNegative" },
            discounts: { presence: "required", sign: "nonNegative" },
            amount: { presence: "required", sign: "nonNegative" },
            cost: { presence: "forbidden", sign: "any" },
        },
        payments: { minimum: 0, sign: "positive", link: "forbidden" },
    },
    RETURN: {
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
        linkedDocument: "required",
        lines: null,
        payments: { minimum: 1, sign: "positive", link: "forbidden" },
    },
    RESTOCK: {
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

        checkSaleAmount(line)
    }
}

/**
 * On a sale line the amount is what was charged: the price times the quantity,
 * less the discounts.
 */
function checkSaleAmount(line: DocumentLineRow): void {
    if (line.unitPrice === null) {
        return
    }
    const gross = Math.abs(line.quantity) * line.unitPrice
    const expected = gross - (line.itemDiscount ?? 0) - (line.globalDiscount ?? 0)
    if (line.amount !== expected) {
        throw new RuleViolationError(
            `Line amount ${line.amount} does not match price and discounts (expected ${expected})`,
        )
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
