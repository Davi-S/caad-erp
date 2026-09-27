/**
 * The engine that checks a document against the spec it is given.
 *
 * `validateDocument` reads a document on its own: the rows its shape allows, the
 * signs they carry, the columns they fill. `validateReferences` and
 * `validateInContext` check it against what it points at, taking those records as
 * data so both stay pure.
 *
 * Rules that cannot be said in a table entry are named functions here, and a type
 * applies the ones its spec lists.
 */

import { paymentMethodValues } from "../../dal/index.js"
import type {
    DocumentType,
    LedgerDocument,
    LedgerIndex,
    NewLedgerDocument,
} from "../../dal/index.js"
import { InactiveError, NotFoundError, RuleViolationError } from "../errors.js"
import type { DocumentReferences, LedgerContext } from "./context.js"
import type {
    AgreementsShape,
    DocumentSpec,
    MovementsShape,
    PaymentsShape,
    Presence,
    ReferenceRule,
    Sign,
} from "./shapes.js"

/**
 * The rules that read one document.
 */
const CHECKS = {
    /**
     * A correction is made now: it does not get a business time of its own, since
     * what it takes back keeps the original's.
     */
    occursWhenRecorded(doc: NewLedgerDocument): void {
        if (doc.occurredAt.getTime() !== doc.recordedAt.getTime()) {
            throw new RuleViolationError(`A ${doc.type} happens when it is recorded`)
        }
    },

    /**
     * What was agreed is the price times the quantity, less the discounts.
     */
    agreementValueMatchesPricing(doc: NewLedgerDocument): void {
        for (const row of doc.agreements) {
            const gross = Math.abs(row.quantity) * (row.unitPrice ?? 0)
            const expected = gross - (row.lineDiscount ?? 0) - (row.documentDiscountShare ?? 0)
            if (row.value !== expected) {
                throw new RuleViolationError(
                    `Value ${row.value} does not match price and discounts (expected ${expected})`,
                )
            }
        }
    },

    /**
     * What was agreed is worth something. Goods that change hands for nothing are
     * their own kind of event - a gift on the way out, a donation on the way in -
     * so a zero total here can only be a price that was forgotten.
     */
    agreementsHaveValue(doc: NewLedgerDocument): void {
        if (sum(doc.agreements.map((row) => row.value)) === 0) {
            throw new RuleViolationError(
                `A ${doc.type} must be worth something; goods that change hands for nothing are a different kind of event`,
            )
        }
    },

    /**
     * What moved is exactly what was agreed: the same products, the same
     * quantities. A shape carrying both kinds of row says the goods moved now and
     * in full; goods agreed now and moved later is what the deferred shapes
     * express, by carrying no movements at all.
     *
     * Goods can move with nothing agreed at all; those shapes simply do not list
     * this rule.
     *
     * It reads one document, so the agreement has to be in it. A delivery matches
     * its movements against a linked document's agreements instead, counting what
     * earlier deliveries already took, which needs the ledger around it: that rule
     * is `movementsWithinAgreed`, below.
     */
    movementsMatchAgreements(doc: NewLedgerDocument): void {
        for (const movement of doc.movements) {
            if (!doc.agreements.some((row) => row.productId === movement.productId)) {
                throw new RuleViolationError(`Nothing was agreed for ${movement.productId}`)
            }
        }

        // One row per product per document, so each agreement has at most one
        // movement to find
        for (const agreed of doc.agreements) {
            const movement = doc.movements.find((row) => row.productId === agreed.productId)
            if (!movement) {
                throw new RuleViolationError(
                    `${Math.abs(agreed.quantity)} of ${agreed.productId} was agreed but did not move`,
                )
            }
            if (movement.quantity !== agreed.quantity) {
                throw new RuleViolationError(
                    `${Math.abs(movement.quantity)} of ${agreed.productId} moved against ${Math.abs(agreed.quantity)} agreed`,
                )
            }
        }
    },

    /**
     * Nothing is left owing: the money that moved covers what was agreed. More
     * than that is a tip, or more handed to a supplier, and is allowed.
     */
    paymentsSettleInFull(doc: NewLedgerDocument): void {
        const agreed = sum(doc.agreements.map((row) => row.value))
        const paid = sum(doc.payments.map((payment) => payment.amount))
        const owed = agreed - paid
        if (owed * Math.sign(agreed) > 0) {
            throw new RuleViolationError(
                `A ${doc.type} leaves nothing owing, but ${Math.abs(owed)} is unsettled`,
            )
        }
    },
}

export type CheckName = keyof typeof CHECKS

/**
 * The rules that read the documents around this one.
 */
const CONTEXT_CHECKS = {
    /**
     * Nothing is settled, fulfilled or taken back against an entry that never
     * happened.
     */
    targetNotVoided(doc: NewLedgerDocument, context: LedgerContext): void {
        const target = context.linked.getDocument(doc.linkedDocumentId!)!
        if (context.linked.linkedDocuments(target.id).some((other) => other.type === "VOID")) {
            throw new RuleViolationError(`${target.id} is voided`)
        }
    },

    /**
     * A void takes back the whole document: every row of it, each in full, and
     * each pointing at the row it reverses.
     *
     * "In full" means every amount on the row, not just the quantity: a void that
     * returned the goods of a credit sale but not its value would leave money owed
     * on a sale that never happened, and one that reversed the value but not the
     * discounts would leave discounts standing on it.
     *
     * The unit price is a rate, not an amount, so it is carried through unchanged
     * and the negated quantity is what reverses it. That keeps every column summable
     * across the whole ledger: a voided document contributes nothing to a total of
     * discounts given, of value agreed, or of `quantity * unitPrice`.
     */
    targetFullyMirrored(doc: NewLedgerDocument, context: LedgerContext): void {
        const target = context.linked.getDocument(doc.linkedDocumentId!)!

        checkMirrors(
            doc.agreements.map((row) => ({
                of: row.linkedAgreementId,
                productId: row.productId,
                negated: [row.quantity, row.value, row.lineDiscount, row.documentDiscountShare],
                same: [row.unitPrice],
            })),
            target.agreements.map((row) => ({
                id: row.id,
                productId: row.productId,
                negated: [row.quantity, row.value, row.lineDiscount, row.documentDiscountShare],
                same: [row.unitPrice],
            })),
            "agreement",
            target.id,
        )
        checkMirrors(
            doc.movements.map((row) => ({
                of: row.linkedMovementId,
                productId: row.productId,
                negated: [row.quantity],
                same: [],
            })),
            target.movements.map((row) => ({
                id: row.id,
                productId: row.productId,
                negated: [row.quantity],
                same: [],
            })),
            "movement",
            target.id,
        )
        checkMirrors(
            doc.payments.map((row) => ({
                of: row.linkedPaymentId,
                negated: [row.amount],
                same: [],
            })),
            target.payments.map((row) => ({ id: row.id, negated: [row.amount], same: [] })),
            "payment",
            target.id,
        )
    },

    /**
     * Goods handed over against a sale stay within what it agreed, counting what
     * earlier deliveries out already took.
     *
     * This is `movementsMatchAgreements` for a document whose agreement lives
     * elsewhere: the units are matched against the linked sale rather than against
     * rows of its own, so it needs the ledger around it. Partial is fine, as
     * instalments are for a payment; over is not. Overpaying leaves credit, but
     * handing over goods that were never sold leaves stock gone with nothing to
     * account for it.
     *
     * A voided delivery out took nothing: its units come back on the void, which hangs
     * off it, and the two cancel in the count.
     */
    movementsWithinAgreed(doc: NewLedgerDocument, context: LedgerContext): void {
        const target = context.linked.getDocument(doc.linkedDocumentId!)!

        // Everything is counted as units, so the signs stay out of the arithmetic
        const agreed = new Map<string, number>()
        for (const row of target.agreements) {
            agreed.set(row.productId, -row.quantity)
        }

        const taken = new Map<string, number>()
        for (const other of descendants(context.linked, target.id)) {
            for (const row of other.movements) {
                taken.set(row.productId, (taken.get(row.productId) ?? 0) - row.quantity)
            }
        }

        for (const row of doc.movements) {
            const promised = agreed.get(row.productId)
            if (promised === undefined) {
                throw new RuleViolationError(
                    `Nothing was agreed for ${row.productId} on ${target.id}`,
                )
            }
            const already = taken.get(row.productId) ?? 0
            const now = -row.quantity
            if (already + now > promised) {
                throw new RuleViolationError(
                    `${promised} of ${row.productId} was agreed and ${already} already moved, so ${now} more cannot`,
                )
            }
        }
    },

    /**
     * What hangs off a document is dealt with first, and a document is voided or
     * it is not, so a second void has nothing left to take back.
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
}

export type ContextCheckName = keyof typeof CONTEXT_CHECKS

/**
 * Checks a document against its spec.
 *
 * @param doc - Document with its rows, as it will be stored.
 * @param spec - What that kind of document is, from its command.
 * @throws {@link RuleViolationError} If any rule is broken.
 */
export function validateDocument(doc: NewLedgerDocument, spec: DocumentSpec): void {
    if (doc.type !== spec.type) {
        // Only reachable by wiring a command to the wrong spec
        throw new Error(`A ${doc.type} was checked against the spec of a ${spec.type}`)
    }

    if (doc.occurredAt.getTime() > doc.recordedAt.getTime()) {
        throw new RuleViolationError("A document cannot have happened after it was recorded")
    }

    checkLink(
        "linked document",
        doc.id,
        doc.linkedDocumentId,
        spec.linkedTypes ? "required" : "forbidden",
        doc.type,
    )

    checkAgreements(doc, spec.shape.agreements)
    checkMovements(doc, spec.shape.movements)
    checkPayments(doc, spec.shape.payments)

    // What follows from the form, then what follows from the intent
    for (const check of [...spec.shape.checks, ...spec.checks]) {
        CHECKS[check](doc)
    }
}

/**
 * Checks what a document is about to refer to, before it is built.
 *
 * @param spec - What the document being built is.
 * @param references - The records it will point at.
 * @param context - What they resolved to, from {@link loadContext}.
 * @throws {@link NotFoundError} If a reference names nothing.
 * @throws {@link InactiveError} If it names something inactive that must be active.
 */
export function validateReferences(
    spec: DocumentSpec,
    references: DocumentReferences,
    context: LedgerContext,
): void {
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
            throw new RuleViolationError(`A ${spec.type} cannot be linked to a ${target.type}`)
        }
    }
}

/**
 * Checks a document against the records it refers to.
 *
 * @param doc - Document with its rows, as it will be stored.
 * @param spec - What that kind of document is, from its command.
 * @param context - What those references resolved to, from {@link loadContext}.
 * @throws {@link RuleViolationError} If any rule is broken.
 */
export function validateInContext(
    doc: NewLedgerDocument,
    spec: DocumentSpec,
    context: LedgerContext,
): void {
    validateReferences(
        spec,
        {
            performedBy: doc.performedBy,
            productIds: [
                ...doc.agreements.map((row) => row.productId),
                ...doc.movements.map((row) => row.productId),
            ],
            linkedDocumentId: doc.linkedDocumentId,
        },
        context,
    )

    for (const check of spec.contextChecks) {
        CONTEXT_CHECKS[check](doc, context)
    }
}

function checkAgreements(doc: NewLedgerDocument, shape: AgreementsShape | null): void {
    if (!shape) {
        if (doc.agreements.length > 0) {
            throw new RuleViolationError(`A ${doc.type} agrees nothing`)
        }
        return
    }
    checkCount(doc.agreements.length, shape.minimum, "agreement", doc.type)
    checkOnePerProduct(doc.agreements, "agreement", doc.type)

    for (const row of doc.agreements) {
        checkBelongs("Agreement", row.id, row.documentId, doc.id)
        checkNumber("Quantity", row.quantity, shape.quantity)
        checkNumber("Value", row.value, shape.value)
        checkLink(
            "linked agreement",
            row.id,
            row.linkedAgreementId,
            shape.linkedAgreementId,
            doc.type,
        )

        // A reversal's pricing is whatever it is taking back, negated, so it is
        // neither required, forbidden nor non-negative here: `targetFullyMirrored`
        // checks it against the original instead.
        const pricing = [
            ["unit price", row.unitPrice, shape.unitPrice],
            ["line discount", row.lineDiscount, shape.lineDiscount],
            ["document discount share", row.documentDiscountShare, shape.documentDiscountShare],
        ] as const
        for (const [what, value, presence] of pricing) {
            checkColumn(what, value, presence, doc.type)
            if (value !== null && presence !== "mirrored") {
                checkNumber("Pricing", value, "nonNegative")
            }
        }
    }
}

function checkMovements(doc: NewLedgerDocument, shape: MovementsShape | null): void {
    if (!shape) {
        if (doc.movements.length > 0) {
            throw new RuleViolationError(`A ${doc.type} moves no goods`)
        }
        return
    }
    checkCount(doc.movements.length, shape.minimum, "movement", doc.type)
    checkOnePerProduct(doc.movements, "movement", doc.type)

    for (const row of doc.movements) {
        checkBelongs("Movement", row.id, row.documentId, doc.id)
        checkNumber("Quantity", row.quantity, shape.quantity)
        checkLink("linked movement", row.id, row.linkedMovementId, shape.linkedMovementId, doc.type)
    }
}

function checkPayments(doc: NewLedgerDocument, shape: PaymentsShape | null): void {
    if (!shape) {
        if (doc.payments.length > 0) {
            throw new RuleViolationError(`A ${doc.type} moves no money`)
        }
        return
    }
    checkCount(doc.payments.length, shape.minimum, "payment", doc.type)

    for (const payment of doc.payments) {
        checkBelongs("Payment", payment.id, payment.documentId, doc.id)
        if (!(paymentMethodValues as readonly string[]).includes(payment.method)) {
            throw new RuleViolationError(`Unknown payment method: ${payment.method}`)
        }
        checkNumber("Payment amount", payment.amount, shape.sign)
        checkLink(
            "linked payment",
            payment.id,
            payment.linkedPaymentId,
            shape.linkedPaymentId,
            doc.type,
        )
    }
}

/**
 * Every document hanging off this one, however deep: the deliveries out against
 * a sale, and the voids against those deliveries.
 */
function descendants(index: LedgerIndex, id: string): LedgerDocument[] {
    return index.linkedDocuments(id).flatMap((doc) => [doc, ...descendants(index, doc.id)])
}

function checkCount(count: number, minimum: number, what: string, type: DocumentType): void {
    if (count < minimum) {
        throw new RuleViolationError(`A ${type} needs at least ${minimum} ${what}(s)`)
    }
}

/**
 * One row per product, so goods that move can always be matched to what was
 * agreed for them.
 */
function checkOnePerProduct(rows: { productId: string }[], what: string, type: DocumentType): void {
    const seen = new Set<string>()
    for (const row of rows) {
        if (seen.has(row.productId)) {
            throw new RuleViolationError(`A ${type} has two ${what} rows for ${row.productId}`)
        }
        seen.add(row.productId)
    }
}

/**
 * Every row of the target is taken back exactly once, by its own negation.
 */
type Mirrorable = { productId?: string; negated: (number | null)[]; same: (number | null)[] }

function checkMirrors(
    reversals: (Mirrorable & { of: string | null })[],
    originals: (Mirrorable & { id: string })[],
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
        const mirror = mirrors[0]
        if (mirror.productId !== original.productId) {
            throw new RuleViolationError(
                `${what} ${original.id} must be taken back for the same product`,
            )
        }
        // A column the original does not carry is not carried back either
        const negates = (value: number | null, against: number | null) =>
            value === null ? against === null : against === -value
        if (original.negated.some((value, position) => !negates(value, mirror.negated[position]))) {
            throw new RuleViolationError(`${what} ${original.id} must be taken back in full`)
        }
        if (original.same.some((value, position) => mirror.same[position] !== value)) {
            throw new RuleViolationError(
                `${what} ${original.id} must be taken back at the same unit price`,
            )
        }
    }
}

function checkSalesman(salesmanId: string, context: LedgerContext, rule: ReferenceRule): void {
    if (rule === "any") {
        return
    }
    if (!context.salesman) {
        throw new NotFoundError(`Unknown salesman: ${salesmanId}`)
    }
    if (rule === "active" && !context.salesman.isActive) {
        throw new InactiveError(`Salesman '${context.salesman.name}' is inactive`)
    }
}

function checkProduct(productId: string, context: LedgerContext, rule: ReferenceRule): void {
    if (rule === "any") {
        return
    }
    const product = context.products.get(productId)
    if (!product) {
        throw new NotFoundError(`Unknown product: ${productId}`)
    }
    if (rule === "active" && !product.isActive) {
        throw new InactiveError(`Product '${product.name}' is inactive`)
    }
}

/**
 * A row belongs to the document it is stored under.
 */
function checkBelongs(what: string, rowId: string, documentId: string, ownerId: string): void {
    if (documentId !== ownerId) {
        throw new RuleViolationError(`${what} ${rowId} belongs to ${documentId}, not ${ownerId}`)
    }
}

function checkLink(
    what: string,
    ownerId: string,
    value: string | null,
    presence: Presence,
    type: DocumentType,
): void {
    if (presence === "required" && value === null) {
        throw new RuleViolationError(`A ${type} must have a ${what}`)
    }
    if (presence === "forbidden" && value !== null) {
        throw new RuleViolationError(`A ${type} cannot have a ${what}`)
    }
    if (value === ownerId) {
        throw new RuleViolationError(`A ${what} cannot point at itself`)
    }
}

function checkColumn(
    what: string,
    value: number | null,
    presence: Presence,
    type: DocumentType,
): void {
    if (presence === "required" && value === null) {
        throw new RuleViolationError(`A ${type} must have a ${what}`)
    }
    if (presence === "forbidden" && value !== null) {
        throw new RuleViolationError(`A ${type} cannot have a ${what}`)
    }
}

/**
 * What each sign allows, and how to say so when it does not.
 */
const SIGNS: Record<Sign, { allows: (value: number) => boolean; requires: string }> = {
    positive: { allows: (value) => value > 0, requires: "must be greater than zero" },
    negative: { allows: (value) => value < 0, requires: "must be less than zero" },
    nonNegative: { allows: (value) => value >= 0, requires: "cannot be negative" },
    nonPositive: { allows: (value) => value <= 0, requires: "cannot be positive" },
    nonZero: { allows: (value) => value !== 0, requires: "cannot be zero" },
    any: { allows: () => true, requires: "" },
}

function checkNumber(what: string, value: number, sign: Sign): void {
    if (!Number.isInteger(value)) {
        throw new RuleViolationError(`${what} must be a whole number of units or cents`)
    }

    const rule = SIGNS[sign]
    if (!rule.allows(value)) {
        throw new RuleViolationError(`${what} ${rule.requires}: ${value}`)
    }
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0)
}
