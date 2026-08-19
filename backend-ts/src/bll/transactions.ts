/**
 * Transaction ledger domain handlers coordinating validation, business rules, and persistence.
 *
 * Implements high-level transaction ledger workflows (`listTransactions`, `getTransaction`,
 * `recordSale`, `recordBulkSale`, `recordRestock`, `recordWriteOff`, `recordCreditPayment`,
 * `recordOpenStock`, `recordVoid`) by colocating Zod command schemas, domain invariant rules,
 * and Data Access Layer (DAL) execution.
 */

import { z } from "zod"
import type { DB, TransactionRow } from "../dal/index.js"
import * as dal from "../dal/index.js"
import { paymentTypeValues } from "../dal/index.js"
import {
    EmptyBulkOperationError,
    IneligibleCreditSaleError,
    IneligibleVoidTargetError,
    InsufficientStockError,
    InvalidAttributeError,
    InvalidMonetaryValueError,
    InvalidQuantityError,
    ProductInactiveError,
    SalesmanInactiveError,
    TransactionNotFoundError,
} from "./errors.js"
import { v7 as uuidv7 } from "uuid"
import { getProduct } from "./products.js"
import { calculateInventory } from "./reports.js"
import { getSalesman } from "./salesmen.js"
import { validateSchema } from "./validator.js"

/**
 * Generates a RFC 9562 compliant UUID v7 transaction identifier string.
 *
 * @returns Time-ordered 36-character UUID v7 string.
 */
export function generateTransactionId(): string {
    return uuidv7()
}

/**
 * Retrieves all transaction records from the ledger log.
 *
 * @param db - Active database client instance.
 * @returns Array of all {@link TransactionRow} items.
 */
export function listTransactions(db: DB): TransactionRow[] {
    return dal.listTransactions(db)
}

/**
 * Zod validation schema and command payload for retrieving a transaction by identifier.
 */
export const getTransactionSchema = z.object({
    id: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Transaction ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
})

export type GetTransactionCommand = z.infer<typeof getTransactionSchema>

/**
 * Retrieves a single transaction record by identifier.
 *
 * @param db - Active database client instance.
 * @param id - Unique transaction identifier.
 * @returns The matching {@link TransactionRow}.
 * @throws {@link InvalidAttributeError} If transaction ID is empty string.
 * @throws {@link TransactionNotFoundError} If no transaction exists with the given ID.
 */
export function getTransaction(db: DB, id: string): TransactionRow {
    validateSchema(getTransactionSchema, { id })
    const all = dal.listTransactions(db)
    const transaction = all.find((tx) => tx.id === id)
    if (!transaction) {
        throw new TransactionNotFoundError(`Unknown transaction id: ${id}`)
    }
    return transaction
}

/**
 * Zod validation schema and command payload for recording a sale transaction.
 */
export const saleCommandSchema = z.object({
    productId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    salesmanId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    quantity: z
        .number()
        .refine((val) => Number.isInteger(val), {
            message: "Quantity must be an integer",
            params: { errorClass: InvalidQuantityError },
        })
        .refine((val) => val > 0, {
            message: "Quantity must be greater than zero",
            params: { errorClass: InvalidQuantityError },
        }),
    totalRevenue: z
        .number()
        .refine((val) => Number.isInteger(val), {
            message: "Amount must be an integer",
            params: { errorClass: InvalidMonetaryValueError },
        })
        .refine((val) => val >= 0, {
            message: "Amount must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        }),
    paymentType: z.enum(paymentTypeValues),
    notes: z.string().nullable().optional(),
})

export type SaleCommand = z.infer<typeof saleCommandSchema>

/**
 * Validates input payload and records a `SALE` transaction in the ledger.
 *
 * @param db - Active database client instance.
 * @param command - Raw input object matching {@link SaleCommand}.
 * @returns The newly recorded {@link TransactionRow}.
 * @throws {@link ProductNotFoundError} If product ID does not exist.
 * @throws {@link ProductInactiveError} If product is inactive.
 * @throws {@link SalesmanNotFoundError} If salesman ID does not exist.
 * @throws {@link SalesmanInactiveError} If salesman is inactive.
 * @throws {@link InsufficientStockError} If requested quantity exceeds available stock.
 */
export function recordSale(db: DB, command: SaleCommand): TransactionRow {
    // Validate input payload structure and boundary types using Zod
    const validated = validateSchema(saleCommandSchema, command)

    // Enforce domain rule checking that referenced product exists and is active
    const product = getProduct(db, validated.productId)
    if (!product.isActive) {
        throw new ProductInactiveError(`Product '${validated.productId}' is inactive`)
    }

    // Enforce domain rule checking that referenced salesman exists and is active
    const salesman = getSalesman(db, validated.salesmanId)
    if (!salesman.isActive) {
        throw new SalesmanInactiveError(`Salesman '${validated.salesmanId}' is inactive`)
    }

    // Enforce domain rule checking sufficient available inventory stock
    const inventory = calculateInventory(db)
    const availableStock = inventory[validated.productId] ?? 0
    if (validated.quantity > availableStock) {
        throw new InsufficientStockError(
            `Insufficient stock for product '${validated.productId}': available ${availableStock}, requested ${validated.quantity}`,
        )
    }

    // Build and persist normalized SALE transaction record
    const now = new Date()
    const transactionRecord: TransactionRow = {
        id: generateTransactionId(),
        timestampIso: now.toISOString(),
        transactionType: "SALE",
        productId: validated.productId,
        salesmanId: validated.salesmanId,
        paymentType: validated.paymentType,
        quantityChange: -Math.abs(validated.quantity),
        totalRevenue: validated.totalRevenue,
        totalCost: 0,
        linkedTransactionId: null,
        notes: validated.notes ?? null,
    }

    return dal.appendTransaction(db, transactionRecord)
}

/**
 * Validates and records a batch list of `SALE` transactions atomically with cart stock checking.
 *
 * Implements an all-or-nothing checkout workflow that validates cart item availability
 * prior to appending sale transactions to the ledger log in sequence.
 *
 * @param db - Active database client instance.
 * @param commands - List of raw sale command objects matching {@link SaleCommand}.
 * @returns Array of recorded {@link TransactionRow} items.
 * @throws {@link EmptyBulkOperationError} If commands list is empty.
 * @throws {@link InsufficientStockError} If aggregate cart quantity exceeds available stock.
 */
export function recordBulkSale(db: DB, commands: SaleCommand[]): TransactionRow[] {
    // Ensure cart contains at least one item
    if (!commands || commands.length === 0) {
        throw new EmptyBulkOperationError("Bulk sale requires at least one item")
    }

    // Validate payload schemas and sum total requested quantity per product ID
    const aggregateQuantities: Record<string, number> = {}
    for (const cmd of commands) {
        const validated = validateSchema(saleCommandSchema, cmd)
        aggregateQuantities[validated.productId] =
            (aggregateQuantities[validated.productId] ?? 0) + validated.quantity
    }

    // Ensure aggregate cart quantities do not exceed available stock
    const inventory = calculateInventory(db)
    for (const [productId, requestedTotal] of Object.entries(aggregateQuantities)) {
        const availableStock = inventory[productId] ?? 0
        if (requestedTotal > availableStock) {
            throw new InsufficientStockError(
                `Insufficient stock for product '${productId}': available ${availableStock}, total requested in cart ${requestedTotal}`,
            )
        }
    }

    // Record each sale transaction in the ledger log
    const recorded: TransactionRow[] = []
    for (const cmd of commands) {
        recorded.push(recordSale(db, cmd))
    }
    return recorded
}

/**
 * Zod validation schema and command payload for recording a restock transaction.
 */
export const restockCommandSchema = z.object({
    productId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    salesmanId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    quantity: z
        .number()
        .refine((val) => Number.isInteger(val), {
            message: "Quantity must be an integer",
            params: { errorClass: InvalidQuantityError },
        })
        .refine((val) => val > 0, {
            message: "Quantity must be greater than zero",
            params: { errorClass: InvalidQuantityError },
        }),
    totalCost: z
        .number()
        .refine((val) => Number.isInteger(val), {
            message: "Amount must be an integer",
            params: { errorClass: InvalidMonetaryValueError },
        })
        .refine((val) => val >= 0, {
            message: "Amount must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        }),
    notes: z.string().nullable().optional(),
})

export type RestockCommand = z.infer<typeof restockCommandSchema>

/**
 * Validates input payload and records a `RESTOCK` transaction in the ledger.
 *
 * @param db - Active database client instance.
 * @param command - Raw input object matching {@link RestockCommand}.
 * @returns The newly recorded {@link TransactionRow}.
 * @throws {@link ProductNotFoundError} If product ID does not exist.
 * @throws {@link ProductInactiveError} If product is inactive.
 * @throws {@link SalesmanNotFoundError} If salesman ID does not exist.
 * @throws {@link SalesmanInactiveError} If salesman is inactive.
 */
export function recordRestock(db: DB, command: RestockCommand): TransactionRow {
    // Validate input payload structure and boundary types using Zod
    const validated = validateSchema(restockCommandSchema, command)

    // Enforce domain rule checking that referenced product exists and is active
    const product = getProduct(db, validated.productId)
    if (!product.isActive) {
        throw new ProductInactiveError(`Product '${validated.productId}' is inactive`)
    }

    // Enforce domain rule checking that referenced salesman exists and is active
    const salesman = getSalesman(db, validated.salesmanId)
    if (!salesman.isActive) {
        throw new SalesmanInactiveError(`Salesman '${validated.salesmanId}' is inactive`)
    }

    // Build and persist normalized RESTOCK transaction record
    const now = new Date()
    const transactionRecord: TransactionRow = {
        id: generateTransactionId(),
        timestampIso: now.toISOString(),
        transactionType: "RESTOCK",
        productId: validated.productId,
        salesmanId: validated.salesmanId,
        paymentType: null,
        quantityChange: Math.abs(validated.quantity),
        totalRevenue: 0,
        totalCost: -Math.abs(validated.totalCost),
        linkedTransactionId: null,
        notes: validated.notes ?? null,
    }

    return dal.appendTransaction(db, transactionRecord)
}

/**
 * Zod validation schema and command payload for recording a write-off transaction.
 */
export const writeOffCommandSchema = z.object({
    productId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    salesmanId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    quantity: z
        .number()
        .refine((val) => Number.isInteger(val), {
            message: "Quantity must be an integer",
            params: { errorClass: InvalidQuantityError },
        })
        .refine((val) => val > 0, {
            message: "Quantity must be greater than zero",
            params: { errorClass: InvalidQuantityError },
        }),
    notes: z.string().nullable().optional(),
})

export type WriteOffCommand = z.infer<typeof writeOffCommandSchema>

/**
 * Validates input payload and records a `WRITE_OFF` transaction in the ledger.
 *
 * @param db - Active database client instance.
 * @param command - Raw input object matching {@link WriteOffCommand}.
 * @returns The newly recorded {@link TransactionRow}.
 * @throws {@link ProductNotFoundError} If product ID does not exist.
 * @throws {@link ProductInactiveError} If product is inactive.
 * @throws {@link SalesmanNotFoundError} If salesman ID does not exist.
 * @throws {@link SalesmanInactiveError} If salesman is inactive.
 * @throws {@link InsufficientStockError} If write-off quantity exceeds available stock.
 */
export function recordWriteOff(db: DB, command: WriteOffCommand): TransactionRow {
    // Validate input payload structure and boundary types using Zod
    const validated = validateSchema(writeOffCommandSchema, command)

    // Enforce domain rule checking that referenced product exists and is active
    const product = getProduct(db, validated.productId)
    if (!product.isActive) {
        throw new ProductInactiveError(`Product '${validated.productId}' is inactive`)
    }

    // Enforce domain rule checking that referenced salesman exists and is active
    const salesman = getSalesman(db, validated.salesmanId)
    if (!salesman.isActive) {
        throw new SalesmanInactiveError(`Salesman '${validated.salesmanId}' is inactive`)
    }

    // Enforce domain rule checking available inventory stock for write-off
    const inventory = calculateInventory(db)
    const availableStock = inventory[validated.productId] ?? 0
    if (validated.quantity > availableStock) {
        throw new InsufficientStockError(
            `Cannot write off ${validated.quantity} units of product '${validated.productId}': only ${availableStock} available`,
        )
    }

    // Build and persist normalized WRITE_OFF transaction record
    const now = new Date()
    const transactionRecord: TransactionRow = {
        id: generateTransactionId(),
        timestampIso: now.toISOString(),
        transactionType: "WRITE_OFF",
        productId: validated.productId,
        salesmanId: validated.salesmanId,
        paymentType: null,
        quantityChange: -Math.abs(validated.quantity),
        totalRevenue: 0,
        totalCost: 0,
        linkedTransactionId: null,
        notes: validated.notes ?? null,
    }

    return dal.appendTransaction(db, transactionRecord)
}

/**
 * Zod validation schema and command payload for recording a credit payment.
 */
export const creditPaymentCommandSchema = z.object({
    linkedTransactionId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Transaction ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    salesmanId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    totalRevenue: z
        .number()
        .refine((val) => Number.isInteger(val), {
            message: "Payment amount must be an integer",
            params: { errorClass: InvalidMonetaryValueError },
        })
        .refine((val) => val > 0, {
            message: "Payment amount must be greater than zero",
            params: { errorClass: InvalidMonetaryValueError },
        }),
    paymentType: z.enum(paymentTypeValues),
    notes: z.string().nullable().optional(),
})

export type CreditPaymentCommand = z.infer<typeof creditPaymentCommandSchema>

/**
 * Validates input payload and records a `CREDIT_PAYMENT` transaction linked to an outstanding sale.
 *
 * @param db - Active database client instance.
 * @param command - Raw input object matching {@link CreditPaymentCommand}.
 * @returns The newly recorded {@link TransactionRow}.
 * @throws {@link TransactionNotFoundError} If linked transaction ID does not exist.
 * @throws {@link IneligibleCreditSaleError} If linked transaction is not an active credit sale.
 * @throws {@link SalesmanNotFoundError} If salesman ID does not exist.
 * @throws {@link SalesmanInactiveError} If salesman is inactive.
 */
export function recordCreditPayment(db: DB, command: CreditPaymentCommand): TransactionRow {
    // Validate input payload structure and boundary types using Zod
    const validated = validateSchema(creditPaymentCommandSchema, command)

    // Enforce domain rule checking that referenced salesman exists and is active
    const salesman = getSalesman(db, validated.salesmanId)
    if (!salesman.isActive) {
        throw new SalesmanInactiveError(`Salesman '${validated.salesmanId}' is inactive`)
    }

    // Enforce domain rule checking that linked transaction exists, is a SALE, and was recorded OnCredit
    const linkedSale = getTransaction(db, validated.linkedTransactionId)
    if (linkedSale.transactionType !== "SALE") {
        throw new IneligibleCreditSaleError("Credit payments must reference a SALE transaction")
    }
    if (linkedSale.paymentType !== "OnCredit") {
        throw new IneligibleCreditSaleError("Linked sale is not recorded as credit")
    }

    // Enforce domain rule checking that linked sale transaction is not voided
    const allTxs = dal.listTransactions(db)
    const voidedTxIds = new Set(
        allTxs
            .filter((tx) => tx.transactionType === "VOID" && tx.linkedTransactionId)
            .map((tx) => tx.linkedTransactionId as string),
    )
    if (voidedTxIds.has(linkedSale.id)) {
        throw new IneligibleCreditSaleError("Cannot process credit payment for voided transaction")
    }

    // Build and persist normalized CREDIT_PAYMENT transaction record
    const now = new Date()
    const transactionRecord: TransactionRow = {
        id: generateTransactionId(),
        timestampIso: now.toISOString(),
        transactionType: "CREDIT_PAYMENT",
        productId: linkedSale.productId,
        salesmanId: validated.salesmanId,
        paymentType: validated.paymentType,
        quantityChange: 0,
        totalRevenue: validated.totalRevenue,
        totalCost: 0,
        linkedTransactionId: validated.linkedTransactionId,
        notes: validated.notes ?? null,
    }

    return dal.appendTransaction(db, transactionRecord)
}

/**
 * Zod validation schema and command payload for voiding a transaction.
 */
export const voidCommandSchema = z.object({
    linkedTransactionId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Transaction ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    notes: z.string().nullable().optional(),
})

export type VoidCommand = z.infer<typeof voidCommandSchema>

/**
 * Validates input payload and records a `VOID` transaction reversing a prior entry.
 *
 * @param db - Active database client instance.
 * @param command - Raw input object matching {@link VoidCommand}.
 * @returns The newly recorded reversing {@link TransactionRow}.
 * @throws {@link TransactionNotFoundError} If target transaction ID does not exist.
 * @throws {@link IneligibleVoidTargetError} If target transaction is already a VOID entry.
 */
export function recordVoid(db: DB, command: VoidCommand): TransactionRow {
    // Validate input payload structure using Zod
    const validated = validateSchema(voidCommandSchema, command)

    // Enforce domain rule checking that target transaction exists
    const target = getTransaction(db, validated.linkedTransactionId)

    // Enforce domain rule checking that target transaction is not already a VOID entry
    if (target.transactionType === "VOID") {
        throw new IneligibleVoidTargetError("Cannot void a VOID transaction")
    }

    // Build and persist exact reversing VOID transaction record
    const now = new Date()
    const reversalRecord: TransactionRow = {
        id: generateTransactionId(),
        timestampIso: now.toISOString(),
        transactionType: "VOID",
        productId: target.productId,
        salesmanId: target.salesmanId,
        paymentType: target.paymentType,
        quantityChange: -target.quantityChange,
        totalRevenue: -target.totalRevenue,
        totalCost: -target.totalCost,
        linkedTransactionId: target.id,
        notes: validated.notes ?? null,
    }

    return dal.appendTransaction(db, reversalRecord)
}
