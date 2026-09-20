/**
 * Salesmen operations.
 *
 * Like products, salesmen are current state and are never deleted: documents
 * record who performed them, so a salesman who left is deactivated instead.
 *
 * The storage records a snapshot of every change; this layer only decides who the
 * change is recorded against. The very first salesman has nobody else, so they
 * are their own author.
 */

import * as dal from "../dal/index.js"
import type { DB, SalesmanHistoryRow, SalesmanRow } from "../dal/index.js"
import { InactiveError, InvalidInputError, NotFoundError } from "./errors.js"
import { newId } from "../ids.js"
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
 *
 * `changedBy` is who is adding them, and is left out only for the very first
 * salesman, when there is nobody to name.
 */
export const createSalesmanSchema = salesmanFields.extend({
    changedBy: z.string().trim().min(1, "The salesman making the change is required").optional(),
})

export type CreateSalesmanCommand = z.infer<typeof createSalesmanSchema>

/**
 * Input for updating a salesman: every editable field is optional, but at least
 * one must be given.
 */
export const updateSalesmanSchema = salesmanFields
    .partial()
    .extend({
        changedBy: z.string().trim().min(1, "The salesman making the change is required"),
    })
    .refine(
        (fields) => Object.keys(fields).some((field) => field !== "changedBy"),
        "No fields to update",
    )

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
 * The salesman performing a new document or making a catalog change.
 *
 * @returns The salesman.
 * @throws {@link NotFoundError} If no salesman has that ID.
 * @throws {@link InactiveError} If the salesman is inactive.
 */
export function requireActiveSalesman(db: DB, id: string): SalesmanRow {
    const salesman = getSalesman(db, id)
    if (!salesman.isActive) {
        throw new InactiveError(`Salesman '${salesman.name}' is inactive`)
    }
    return salesman
}

/**
 * @returns Every snapshot of the salesman, oldest first; the first one is their
 * creation.
 * @throws {@link NotFoundError} If no salesman has that ID.
 */
export function getSalesmanHistory(db: DB, id: string): SalesmanHistoryRow[] {
    getSalesman(db, id)
    return dal.listSalesmanHistory(db, id)
}

/**
 * Creates a salesman and records their first snapshot.
 *
 * The first salesman of an empty database is created without `changedBy` and is
 * recorded as their own author; after that, `changedBy` is required.
 *
 * @param command - Raw input matching {@link createSalesmanSchema}.
 * @returns The stored salesman.
 * @throws {@link InvalidInputError} If the input is not valid, if `changedBy` is
 * missing while salesmen exist, or if it is given while none do.
 * @throws {@link NotFoundError} If the salesman making the change does not exist.
 * @throws {@link InactiveError} If that salesman is inactive.
 */
export function createSalesman(db: DB, command: CreateSalesmanCommand): SalesmanRow {
    const { changedBy, ...fields } = validate(createSalesmanSchema, command)

    return dal.inTransaction(db, () => {
        const isFirst = dal.listSalesmen(db).length === 0
        if (isFirst && changedBy) {
            throw new InvalidInputError("The first salesman cannot be created by another salesman")
        }
        if (!isFirst && !changedBy) {
            throw new InvalidInputError("The salesman making the change is required")
        }
        if (changedBy) {
            requireActiveSalesman(db, changedBy)
        }

        // The first salesman has nobody else to be recorded against
        const id = newId()
        return dal.insertSalesman(db, { id, ...fields }, changedBy ?? id)
    })
}

/**
 * Replaces the given fields of a salesman and records a snapshot of the result.
 *
 * @param command - Raw input matching {@link updateSalesmanSchema}.
 * @returns The updated salesman.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If either salesman does not exist.
 * @throws {@link InactiveError} If the salesman making the change is inactive.
 */
export function updateSalesman(db: DB, id: string, command: UpdateSalesmanCommand): SalesmanRow {
    const { changedBy, ...fields } = validate(updateSalesmanSchema, command)

    return dal.inTransaction(db, () => {
        requireActiveSalesman(db, changedBy)
        const salesman = dal.updateSalesman(db, id, fields, changedBy)
        if (!salesman) {
            throw new NotFoundError(`Unknown salesman: ${id}`)
        }
        return salesman
    })
}
