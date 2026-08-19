/**
 * Database table schemas and inferred domain row types using Drizzle ORM.
 *
 * Defines SQLite tables for products, salesmen, and transactions along with
 * string union enums and TypeScript interfaces.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Supported payment mechanism for sales transactions.
 */
export const paymentTypeValues = ["Cash", "OnCredit", "PIX", "Other"] as const
export type PaymentType = (typeof paymentTypeValues)[number]

/**
 * Supported transaction ledger type classification.
 */
export const transactionTypeValues = [
    "SALE",
    "RESTOCK",
    "WRITE_OFF",
    "CREDIT_PAYMENT",
    "VOID",
] as const
export type TransactionType = (typeof transactionTypeValues)[number]

/**
 * Products database table schema.
 */
export const products = sqliteTable("products", {
    id: text("product_id").primaryKey(),
    name: text("product_name").notNull(),
    sellPrice: integer("sell_price").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * Salesmen database table schema.
 */
export const salesmen = sqliteTable("salesmen", {
    id: text("salesman_id").primaryKey(),
    name: text("salesman_name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * Transaction log database table schema.
 */
export const transactions = sqliteTable("transactions", {
    id: text("transaction_id").primaryKey(),
    timestampIso: text("timestamp_iso").notNull(),
    transactionType: text("transaction_type", {
        enum: transactionTypeValues,
    }).notNull(),
    productId: text("product_id")
        .notNull()
        .references(() => products.id),
    salesmanId: text("salesman_id")
        .notNull()
        .references(() => salesmen.id),
    paymentType: text("payment_type", { enum: paymentTypeValues }),
    quantityChange: integer("quantity_change").notNull(),
    totalRevenue: integer("total_revenue").notNull(),
    totalCost: integer("total_cost").notNull(),
    linkedTransactionId: text("linked_transaction_id"),
    notes: text("notes"),
})

/**
 * In-memory representation of a row from the `products`, `salesmen`, and
 * `transactions` tables.
 */
export type ProductRow = typeof products.$inferSelect
export type SalesmanRow = typeof salesmen.$inferSelect
export type TransactionRow = typeof transactions.$inferSelect
