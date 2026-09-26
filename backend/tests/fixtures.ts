/**
 * Fixtures for the DAL tests.
 *
 * Everything here goes through the DAL, never the BLL, so a storage test never
 * depends on a business rule. Records are built with whatever the test asks for:
 * the DAL checks nothing, and documents that no command would ever build are
 * exactly what some of these tests need.
 */

import {
    applySchema,
    createDb,
    insertProduct,
    insertSalesman,
    type AgreementRow,
    type DB,
    type MovementRow,
    type NewLedgerDocument,
    type PaymentRow,
    type ProductRow,
    type SalesmanRow,
} from "../src/dal/index.js"
import { newId } from "../src/ids.js"

/** A fixed moment, so nothing in a test depends on the clock. */
export const AT = new Date("2026-01-02T15:00:00.000Z")

/**
 * An empty database with the schema applied, held in memory for one test.
 */
export function freshDb(): DB {
    const db = createDb(":memory:")
    applySchema(db.$client)
    return db
}

/**
 * A salesman recorded as their own author, the way the first one always is.
 */
export function addSalesman(db: DB, fields: Partial<Omit<SalesmanRow, "id">> = {}): SalesmanRow {
    const id = newId()
    return insertSalesman(db, { id, name: "Boss", isActive: true, ...fields }, id)
}

export function addProduct(
    db: DB,
    changedBy: string,
    fields: Partial<Omit<ProductRow, "id">> = {},
): ProductRow {
    const record = { id: newId(), name: "Coke", sellPrice: 500, isActive: true, ...fields }
    return insertProduct(db, record, changedBy)
}

/**
 * A document record as storage takes it. The ID is given rather than generated,
 * so the caller can build the rows that belong to it.
 */
export function documentRecord(
    id: string,
    performedBy: string,
    fields: Partial<Omit<NewLedgerDocument, "id" | "performedBy">> = {},
): NewLedgerDocument {
    return {
        id,
        type: "SALE",
        occurredAt: AT,
        recordedAt: AT,
        performedBy,
        linkedDocumentId: null,
        notes: null,
        agreements: [],
        movements: [],
        payments: [],
        ...fields,
    }
}

export function agreementRow(
    documentId: string,
    productId: string,
    fields: Partial<Omit<AgreementRow, "id" | "documentId" | "productId">> = {},
): AgreementRow {
    return {
        id: newId(),
        documentId,
        productId,
        linkedAgreementId: null,
        quantity: -1,
        unitPrice: 500,
        lineDiscount: 0,
        documentDiscountShare: 0,
        value: 500,
        ...fields,
    }
}

export function movementRow(
    documentId: string,
    productId: string,
    fields: Partial<Omit<MovementRow, "id" | "documentId" | "productId">> = {},
): MovementRow {
    return { id: newId(), documentId, productId, linkedMovementId: null, quantity: -1, ...fields }
}

export function paymentRow(
    documentId: string,
    fields: Partial<Omit<PaymentRow, "id" | "documentId">> = {},
): PaymentRow {
    return {
        id: newId(),
        documentId,
        linkedPaymentId: null,
        method: "Cash",
        amount: 500,
        ...fields,
    }
}
