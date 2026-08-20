/**
 * Analytics and reporting handlers derived from database transaction records.
 *
 * Implements analytical calculation routines (`calculateInventory`,
 * `calculateTotalRevenue`, `calculateTotalCost`, `calculateNetProfit`,
 * `calculateOutstandingDebts`) providing consolidated business metrics.
 */

import type { DB } from "../dal/index.js"
import * as dal from "../dal/index.js"
import { getProduct } from "./products.js"

/**
 * Snapshot describing an outstanding credit balance on a credit sale.
 */
export interface OutstandingDebt {
    transactionId: string
    timestampIso: string
    productId: string
    salesmanId: string
    quantity: number
    expectedAmount: number
    amountPaid: number
    balance: number
}

/**
 * Report payload containing individual credit balances and aggregate outstanding debt.
 */
export interface OutstandingDebtsReport {
    balances: OutstandingDebt[]
    totalOutstanding: number
}

/**
 * Computes current on-hand inventory stock balances for all catalog products.
 *
 * @param db - Active database client instance.
 * @returns Mapping of product IDs to cumulative available stock.
 */
export function calculateInventory(db: DB): Record<string, number> {
    const inventory: Record<string, number> = {}

    // Accumulate signed quantity changes across all recorded transactions
    for (const tx of dal.listTransactions(db)) {
        inventory[tx.productId] = (inventory[tx.productId] ?? 0) + tx.quantityChange
    }

    // Ensure products with zero transaction history are initialized to 0
    for (const product of dal.listProducts(db)) {
        if (!(product.id in inventory)) {
            inventory[product.id] = 0
        }
    }

    return inventory
}

/**
 * Computes total gross revenue collected across all transactions.
 *
 * @param db - Active database client instance.
 * @returns Gross revenue amount.
 */
export function calculateTotalRevenue(db: DB): number {
    let totalRevenue = 0
    for (const tx of dal.listTransactions(db)) {
        totalRevenue += tx.totalRevenue
    }
    return totalRevenue
}

/**
 * Computes total inventory spend / costs incurred across all transactions.
 *
 * @param db - Active database client instance.
 * @returns Total cost amount (stored as a negative number).
 */
export function calculateTotalCost(db: DB): number {
    let totalCost = 0
    for (const tx of dal.listTransactions(db)) {
        totalCost += tx.totalCost
    }
    return totalCost
}

/**
 * Computes net profit across all transactions (`totalRevenue + totalCost`).
 *
 * @param db - Active database client instance.
 * @returns Net profit amount.
 */
export function calculateNetProfit(db: DB): number {
    return calculateTotalRevenue(db) + calculateTotalCost(db)
}

/**
 * Computes unpaid debt balances for non-voided credit sales.
 *
 * @param db - Active database client instance.
 * @returns {@link OutstandingDebtsReport} containing detailed credit sale balances and total outstanding debt.
 */
export function calculateOutstandingDebts(db: DB): OutstandingDebtsReport {
    const allTransactions = dal.listTransactions(db)

    // Collect all voided transaction IDs to ignore negated sales and payments
    const voidedTxIds = new Set(
        allTransactions
            .filter((tx) => tx.transactionType === "VOID" && tx.linkedTransactionId)
            .map((tx) => tx.linkedTransactionId as string),
    )

    // Aggregate total payments collected per credit sale transaction ID
    const paymentsBySale: Record<string, number> = {}
    for (const tx of allTransactions) {
        if (
            tx.transactionType === "CREDIT_PAYMENT" &&
            tx.linkedTransactionId &&
            !voidedTxIds.has(tx.id)
        ) {
            paymentsBySale[tx.linkedTransactionId] =
                (paymentsBySale[tx.linkedTransactionId] ?? 0) + tx.totalRevenue
        }
    }

    const balances: OutstandingDebt[] = []
    let totalOutstanding = 0

    // Process all active credit sales
    for (const entry of allTransactions) {
        if (entry.transactionType !== "SALE") {
            continue
        }
        if (entry.paymentType !== "OnCredit") {
            continue
        }
        if (voidedTxIds.has(entry.id)) {
            continue
        }

        const quantity = Math.abs(entry.quantityChange)

        // Derive expected amount directly from catalog product price * quantity
        let expectedAmount = 0
        try {
            const product = getProduct(db, entry.productId)
            expectedAmount = product.sellPrice * quantity
        } catch {
            expectedAmount = 0
        }

        if (expectedAmount <= 0) {
            continue
        }

        const amountPaid = paymentsBySale[entry.id] ?? 0
        const balance = expectedAmount - amountPaid

        if (balance <= 0) {
            continue
        }

        const debtRecord: OutstandingDebt = {
            transactionId: entry.id,
            timestampIso: entry.timestampIso,
            productId: entry.productId,
            salesmanId: entry.salesmanId,
            quantity,
            expectedAmount,
            amountPaid,
            balance,
        }

        balances.push(debtRecord)
        totalOutstanding += balance
    }

    return {
        balances,
        totalOutstanding,
    }
}
