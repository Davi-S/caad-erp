/**
 * Master data: the records documents are written against.
 *
 * Products and salesmen are current state, kept up to date in place, unlike the
 * ledger, which only ever appends what happened. Nothing here is deleted, because
 * ledger rows point at it.
 */

export * from "./products.js"
export * from "./salesmen.js"
