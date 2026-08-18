/**
 * Database table schemas and inferred domain row types using Drizzle ORM.
 *
 * Defines SQLite tables for products, salesmen, and transactions along with
 * string union enums and TypeScript interfaces.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Array of canonical payment type values supported by the transaction log.
 */
export const paymentTypeValues = ["Cash", "OnCredit", "PIX", "Other"] as const

/**
 * Supported payment mechanism for sales transactions.
 */
export type PaymentType = (typeof paymentTypeValues)[number]

/**
 * Array of canonical transaction type values supported by the transaction log.
 */
export const transactionTypeValues = [
    "SALE",
    "RESTOCK",
    "WRITE_OFF",
    "CREDIT_PAYMENT",
    "OPEN_STOCK",
    "VOID",
] as const

/**
 * Supported transaction ledger type classification.
 */
export type TransactionType = (typeof transactionTypeValues)[number]

/**
 * Products database table schema.
 */
export const products = sqliteTable("products", {
    productId: text("product_id").primaryKey(),
    productName: text("product_name").notNull(),
    sellPrice: integer("sell_price").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * Salesmen database table schema.
 */
export const salesmen = sqliteTable("salesmen", {
    salesmanId: text("salesman_id").primaryKey(),
    salesmanName: text("salesman_name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * Transaction log database table schema.
 */
export const transactions = sqliteTable("transactions", {
    transactionId: text("transaction_id").primaryKey(),
    timestampIso: text("timestamp_iso").notNull(),
    transactionType: text("transaction_type", { enum: transactionTypeValues }).notNull(),
    productId: text("product_id")
        .notNull()
        .references(() => products.productId),
    salesmanId: text("salesman_id")
        .notNull()
        .references(() => salesmen.salesmanId),
    paymentType: text("payment_type", { enum: paymentTypeValues }),
    quantityChange: integer("quantity_change").notNull(),
    totalRevenue: integer("total_revenue").notNull(),
    totalCost: integer("total_cost").notNull(),
    linkedTransactionId: text("linked_transaction_id"),
    notes: text("notes"),
})

/**
 * In-memory representation of a row from the `products` table.
 */
export type ProductRow = typeof products.$inferSelect

/**
 * In-memory representation of a row from the `salesmen` table.
 */
export type SalesmanRow = typeof salesmen.$inferSelect

/**
 * In-memory representation of a row from the `transactions` table.
 */
export type TransactionRow = typeof transactions.$inferSelect
