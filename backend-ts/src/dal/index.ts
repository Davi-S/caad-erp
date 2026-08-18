/**
 * Barrel export module for the Data Access Layer (DAL).
 *
 * Re-exports database schemas, connection client helpers, and entity-specific
 * query primitives for products, salesmen, and transaction logs.
 */

export * from './schema.js';
export * from './client.js';
export * from './products.js';
export * from './salesmen.js';
export * from './transactions.js';
