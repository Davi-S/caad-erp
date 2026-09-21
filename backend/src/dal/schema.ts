/**
 * Drizzle mirror of the tables defined in `ddl.ts`, used for typed queries.
 *
 * Must match `ddl.ts` column for column. The value lists below only type the
 * columns in TypeScript; the database does not check them.
 */

import { integer, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"

/**
 * Kinds of business event recorded as a document.
 */
export const documentTypeValues = [
    "SALE",
    "RETURN",
    "PAYMENT",
    "RESTOCK",
    "WRITE_OFF",
    "VOID",
] as const
export type DocumentType = (typeof documentTypeValues)[number]

/**
 * Ways money can move.
 */
export const paymentMethodValues = ["Cash", "PIX", "Other"] as const
export type PaymentMethod = (typeof paymentMethodValues)[number]

/**
 * Product catalog (current state).
 */
export const products = sqliteTable("products", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sellPrice: integer("sell_price").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * Salesmen (current state).
 */
export const salesmen = sqliteTable("salesmen", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * One snapshot per change to a product, in the state it was left in.
 */
export const productHistory = sqliteTable("product_history", {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull().unique(),
    productId: text("product_id")
        .notNull()
        .references(() => products.id),
    changedBy: text("changed_by")
        .notNull()
        .references(() => salesmen.id),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    name: text("name").notNull(),
    sellPrice: integer("sell_price").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * One snapshot per change to a salesman, in the state it was left in.
 */
export const salesmanHistory = sqliteTable("salesman_history", {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull().unique(),
    salesmanId: text("salesman_id")
        .notNull()
        .references(() => salesmen.id),
    changedBy: text("changed_by")
        .notNull()
        .references(() => salesmen.id),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    name: text("name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
})

/**
 * One row per business event.
 */
export const documents = sqliteTable("documents", {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull().unique(),
    type: text("type", { enum: documentTypeValues }).notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    performedBy: text("performed_by")
        .notNull()
        .references(() => salesmen.id),
    linkedDocumentId: text("linked_document_id").references((): AnySQLiteColumn => documents.id),
    notes: text("notes"),
})

/**
 * Goods: what moved in stock.
 */
export const documentLines = sqliteTable("document_lines", {
    id: text("id").primaryKey(),
    documentId: text("document_id")
        .notNull()
        .references(() => documents.id),
    productId: text("product_id")
        .notNull()
        .references(() => products.id),
    linkedLineId: text("linked_line_id").references((): AnySQLiteColumn => documentLines.id),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price"),
    lineDiscount: integer("line_discount"),
    documentDiscountShare: integer("document_discount_share"),
    amount: integer("amount"),
    totalCost: integer("total_cost"),
})

/**
 * Money: what moved, and how.
 */
export const payments = sqliteTable("payments", {
    id: text("id").primaryKey(),
    documentId: text("document_id")
        .notNull()
        .references(() => documents.id),
    linkedPaymentId: text("linked_payment_id").references((): AnySQLiteColumn => payments.id),
    method: text("method", { enum: paymentMethodValues }).notNull(),
    amount: integer("amount").notNull(),
})

export type ProductRow = typeof products.$inferSelect
export type SalesmanRow = typeof salesmen.$inferSelect
export type ProductHistoryRow = typeof productHistory.$inferSelect
export type SalesmanHistoryRow = typeof salesmanHistory.$inferSelect
export type DocumentRow = typeof documents.$inferSelect
export type DocumentLineRow = typeof documentLines.$inferSelect
export type PaymentRow = typeof payments.$inferSelect
