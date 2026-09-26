/**
 * Product catalog operations.
 *
 * Products are current state, not ledger entries: they are created and updated in
 * place. They are never deleted, because ledger rows point at them; a product that
 * should no longer be sold is deactivated instead.
 *
 * The storage records a snapshot of every change; this layer only decides who the
 * change is recorded against. No rule reads that trail: new documents are always
 * governed by the current catalog.
 */

import * as dal from "../dal/index.js"
import type { DB, ProductHistoryRow, ProductRow } from "../dal/index.js"
import { NotFoundError } from "./errors.js"
import { newId } from "../ids.js"
import { changedByField, requireActiveSalesman } from "./salesmen.js"
import { validate } from "./validate.js"
import { z } from "zod"

/**
 * The editable fields of a product. Prices are integer cents.
 */
const productFields = z.strictObject({
    name: z.string().trim().min(1, "Name is required"),
    sellPrice: z
        .int("Price must be an integer amount in cents")
        .nonnegative("Price cannot be negative"),
    isActive: z.boolean(),
})

/**
 * Input for creating a product: every field must be given.
 */
export const createProductSchema = productFields.extend(changedByField)

export type CreateProductCommand = z.infer<typeof createProductSchema>

/**
 * Input for updating a product: every editable field is optional, but at least
 * one must be given.
 */
export const updateProductSchema = productFields
    .partial()
    .extend(changedByField)
    .refine(
        (fields) => Object.keys(fields).some((field) => field !== "changedBy"),
        "No fields to update",
    )

export type UpdateProductCommand = z.infer<typeof updateProductSchema>

/**
 * @returns Every product, active or not.
 */
export function listProducts(db: DB): ProductRow[] {
    return dal.listProducts(db)
}

/**
 * @returns The product with the given ID.
 * @throws {@link NotFoundError} If no product has that ID.
 */
export function getProduct(db: DB, id: string): ProductRow {
    const product = dal.getProduct(db, id)
    if (!product) {
        throw new NotFoundError(`Unknown product: ${id}`)
    }
    return product
}

/**
 * @returns Every snapshot of the product, oldest first; the first one is its
 * creation.
 * @throws {@link NotFoundError} If no product has that ID.
 */
export function getProductHistory(db: DB, id: string): ProductHistoryRow[] {
    getProduct(db, id)
    return dal.listProductHistory(db, id)
}

/**
 * Creates a product and records its first snapshot.
 *
 * @param command - Raw input matching {@link createProductSchema}.
 * @returns The stored product.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman making the change does not exist.
 * @throws {@link InactiveError} If that salesman is inactive.
 */
export function createProduct(db: DB, command: CreateProductCommand): ProductRow {
    const { changedBy, ...fields } = validate(createProductSchema, command)

    return dal.inTransaction(db, () => {
        requireActiveSalesman(db, changedBy)
        return dal.insertProduct(db, { id: newId(), ...fields }, changedBy)
    })
}

/**
 * Replaces the given fields of a product and records a snapshot of the result.
 *
 * @param command - Raw input matching {@link updateProductSchema}.
 * @returns The updated product.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the product or the salesman does not exist.
 * @throws {@link InactiveError} If the salesman is inactive.
 */
export function updateProduct(db: DB, id: string, command: UpdateProductCommand): ProductRow {
    const { changedBy, ...fields } = validate(updateProductSchema, command)

    return dal.inTransaction(db, () => {
        requireActiveSalesman(db, changedBy)
        const product = dal.updateProduct(db, id, fields, changedBy)
        if (!product) {
            throw new NotFoundError(`Unknown product: ${id}`)
        }
        return product
    })
}
