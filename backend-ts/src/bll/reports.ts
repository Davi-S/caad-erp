/**
 * Analytics and reporting handlers derived from database transaction records.
 *
 * Implements high-level analytical calculation routines (`calculateInventory`,
 * `calculateProfitSummary`, `calculateOutstandingDebts`) providing consolidated
 * business metrics for inventory stock balances, profit summaries, and unpaid credit balances.
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
 * Summary containing aggregate revenue, cost, and net profit metrics.
 */
export interface ProfitSummary {
    totalRevenue: number
    totalCost: number
    profit: number
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
        if (!(product.productId in inventory)) {
            inventory[product.productId] = 0
        }
    }

    return inventory
}

/**
 * Produces aggregate revenue, cost, and net profit metrics across all transactions.
 *
 * @param db - Active database client instance.
 * @returns {@link ProfitSummary} containing gross revenue, total cost spend, and net profit.
 */
export function calculateProfitSummary(db: DB): ProfitSummary {
    let totalRevenue = 0
    let totalCost = 0

    for (const tx of dal.listTransactions(db)) {
        totalRevenue += tx.totalRevenue
        totalCost += tx.totalCost
    }

    const profit = totalRevenue + totalCost

    return {
        totalRevenue,
        totalCost,
        profit,
    }
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
            !voidedTxIds.has(tx.transactionId)
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
        if (voidedTxIds.has(entry.transactionId)) {
            continue
        }

        const quantity = Math.abs(entry.quantityChange)

        // Derive expected amount from explicit sale revenue or product sell price
        let expectedAmount = entry.totalRevenue
        if (expectedAmount <= 0) {
            try {
                const product = getProduct(db, entry.productId)
                expectedAmount = product.sellPrice * quantity
            } catch {
                // Fall back gracefully if product lookups fail
                expectedAmount = 0
            }
        }

        if (expectedAmount <= 0) {
            continue
        }

        const amountPaid = paymentsBySale[entry.transactionId] ?? 0
        const balance = expectedAmount - amountPaid

        if (balance <= 0) {
            continue
        }

        const debtRecord: OutstandingDebt = {
            transactionId: entry.transactionId,
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
