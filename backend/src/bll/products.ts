/**
 * Product catalog operations.
 *
 * Products are current state, not ledger entries: they are created and updated in
 * place. They are never deleted, because ledger lines point at them; a product
 * that is no longer sold is deactivated instead.
 */

import * as dal from "../dal/index.js"
import type { DB, ProductRow } from "../dal/index.js"
import { NotFoundError } from "./errors.js"
import { newId } from "./ids.js"
import { validate } from "./validate.js"
import { z } from "zod"

/**
 * The editable fields of a product. Prices are integer cents.
 */
const productFields = z.object({
    name: z.string().trim().min(1, "Name is required"),
    sellPrice: z
        .int("Price must be an integer amount in cents")
        .nonnegative("Price cannot be negative"),
    isActive: z.boolean(),
})

/**
 * Input for creating a product: every field must be given.
 */
export const createProductSchema = productFields

export type CreateProductCommand = z.infer<typeof createProductSchema>

/**
 * Input for updating a product: every field is optional, but at least one must be
 * given.
 */
export const updateProductSchema = productFields
    .partial()
    .refine((fields) => Object.keys(fields).length > 0, "No fields to update")

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
 * Creates a product.
 *
 * @param command - Raw input matching {@link createProductSchema}.
 * @returns The stored product.
 * @throws {@link InvalidInputError} If the input is not valid.
 */
export function createProduct(db: DB, command: CreateProductCommand): ProductRow {
    const fields = validate(createProductSchema, command)
    return dal.insertProduct(db, { id: newId(), ...fields })
}

/**
 * Replaces the given fields of a product.
 *
 * @param command - Raw input matching {@link updateProductSchema}.
 * @returns The updated product.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If no product has that ID.
 */
export function updateProduct(db: DB, id: string, command: UpdateProductCommand): ProductRow {
    const fields = validate(updateProductSchema, command)
    const updated = dal.updateProduct(db, id, fields)
    if (!updated) {
        throw new NotFoundError(`Unknown product: ${id}`)
    }
    return updated
}
