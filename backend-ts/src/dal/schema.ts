import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const paymentTypeValues = ['Cash', 'OnCredit', 'PIX', 'Other'] as const;
export type PaymentType = (typeof paymentTypeValues)[number];

export const transactionTypeValues = [
  'SALE',
  'RESTOCK',
  'WRITE_OFF',
  'CREDIT_PAYMENT',
  'OPEN_STOCK',
  'VOID',
] as const;
export type TransactionType = (typeof transactionTypeValues)[number];

export const products = sqliteTable('products', {
  productId: text('product_id').primaryKey(),
  productName: text('product_name').notNull(),
  sellPrice: integer('sell_price').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
});

export const salesmen = sqliteTable('salesmen', {
  salesmanId: text('salesman_id').primaryKey(),
  salesmanName: text('salesman_name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
});

export const transactions = sqliteTable('transactions', {
  transactionId: text('transaction_id').primaryKey(),
  timestampIso: text('timestamp_iso').notNull(),
  transactionType: text('transaction_type', { enum: transactionTypeValues }).notNull(),
  productId: text('product_id')
    .notNull()
    .references(() => products.productId),
  salesmanId: text('salesman_id')
    .notNull()
    .references(() => salesmen.salesmanId),
  paymentType: text('payment_type', { enum: paymentTypeValues }),
  quantityChange: integer('quantity_change').notNull(),
  totalRevenue: integer('total_revenue').notNull(),
  totalCost: integer('total_cost').notNull(),
  linkedTransactionId: text('linked_transaction_id'),
  notes: text('notes'),
});

export type ProductRow = typeof products.$inferSelect;
export type SalesmanRow = typeof salesmen.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
