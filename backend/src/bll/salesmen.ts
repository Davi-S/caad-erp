/**
 * Salesmen operations.
 *
 * Like products, salesmen are current state and are never deleted: documents
 * record who performed them, so a salesman who left is deactivated instead.
 */

import * as dal from "../dal/index.js"
import type { DB, SalesmanRow } from "../dal/index.js"
import { NotFoundError } from "./errors.js"
import { newId } from "./ids.js"
import { validate } from "./validate.js"
import { z } from "zod"

/**
 * The editable fields of a salesman.
 */
const salesmanFields = z.object({
    name: z.string().trim().min(1, "Name is required"),
    isActive: z.boolean(),
})

/**
 * Input for creating a salesman: every field must be given.
 */
export const createSalesmanSchema = salesmanFields

export type CreateSalesmanCommand = z.infer<typeof createSalesmanSchema>

/**
 * Input for updating a salesman: every field is optional, but at least one must
 * be given.
 */
export const updateSalesmanSchema = salesmanFields
    .partial()
    .refine((fields) => Object.keys(fields).length > 0, "No fields to update")

export type UpdateSalesmanCommand = z.infer<typeof updateSalesmanSchema>

/**
 * @returns Every salesman, active or not.
 */
export function listSalesmen(db: DB): SalesmanRow[] {
    return dal.listSalesmen(db)
}

/**
 * @returns The salesman with the given ID.
 * @throws {@link NotFoundError} If no salesman has that ID.
 */
export function getSalesman(db: DB, id: string): SalesmanRow {
    const salesman = dal.getSalesman(db, id)
    if (!salesman) {
        throw new NotFoundError(`Unknown salesman: ${id}`)
    }
    return salesman
}

/**
 * Creates a salesman.
 *
 * @param command - Raw input matching {@link createSalesmanSchema}.
 * @returns The stored salesman.
 * @throws {@link InvalidInputError} If the input is not valid.
 */
export function createSalesman(db: DB, command: CreateSalesmanCommand): SalesmanRow {
    const fields = validate(createSalesmanSchema, command)
    return dal.insertSalesman(db, { id: newId(), ...fields })
}

/**
 * Replaces the given fields of a salesman.
 *
 * @param command - Raw input matching {@link updateSalesmanSchema}.
 * @returns The updated salesman.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If no salesman has that ID.
 */
export function updateSalesman(db: DB, id: string, command: UpdateSalesmanCommand): SalesmanRow {
    const fields = validate(updateSalesmanSchema, command)
    const updated = dal.updateSalesman(db, id, fields)
    if (!updated) {
        throw new NotFoundError(`Unknown salesman: ${id}`)
    }
    return updated
}
