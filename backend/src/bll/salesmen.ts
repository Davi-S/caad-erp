/**
 * Salesmen operations.
 *
 * Like products, salesmen are current state and are never deleted: documents
 * record who performed them, so a salesman who left is deactivated instead.
 *
 * The storage records a snapshot of every change; this layer only decides who the
 * change is recorded against. Every salesman is added by an active salesman, which
 * leaves the first one with nobody to name: they come from `createFirstSalesman`,
 * once, and are recorded as their own author.
 */

import * as dal from "../dal/index.js"
import type { DB, SalesmanHistoryRow, SalesmanRow } from "../dal/index.js"
import { InactiveError, NotFoundError, RuleViolationError } from "./errors.js"
import { newId } from "../ids.js"
import { validate } from "./validate.js"
import { z } from "zod"

/**
 * The editable fields of a salesman.
 */
const salesmanFields = z.strictObject({
    name: z.string().trim().min(1, "Name is required"),
    isActive: z.boolean(),
})

/**
 * Who is making a change, on any command that records one.
 *
 * The same message either way, so a caller who leaves it out and one who sends a
 * blank string are told the same thing.
 */
export const changedByField = {
    changedBy: z
        .string({ error: "The salesman making the change is required" })
        .trim()
        .min(1, "The salesman making the change is required"),
}

/**
 * Input for the first salesman: their name, and nothing else.
 *
 * There is nobody to attribute them to, and they are active by definition. A
 * lounge whose only salesman is inactive could record nothing at all, and could
 * not even bring them back, since that change would need an active author.
 */
export const createFirstSalesmanSchema = z.strictObject({ name: salesmanFields.shape.name })

export type CreateFirstSalesmanCommand = z.infer<typeof createFirstSalesmanSchema>

/**
 * Input for creating a salesman: every field must be given, including who is
 * adding them.
 */
export const createSalesmanSchema = salesmanFields.extend(changedByField)

export type CreateSalesmanCommand = z.infer<typeof createSalesmanSchema>

/**
 * Input for updating a salesman: every editable field is optional, but at least
 * one must be given.
 */
export const updateSalesmanSchema = salesmanFields
    .partial()
    .extend(changedByField)
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
 * Creates the salesman a new ledger starts with, recorded as their own author.
 *
 * Only ever the first: every salesman after them is added by one of them, so no
 * salesman can be brought into being without somebody answering for it.
 *
 * @param command - Raw input matching {@link createFirstSalesmanSchema}.
 * @returns The stored salesman.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link RuleViolationError} If the ledger already has a salesman.
 */
export function createFirstSalesman(db: DB, command: CreateFirstSalesmanCommand): SalesmanRow {
    const fields = validate(createFirstSalesmanSchema, command)

    return dal.inTransaction(db, () => {
        if (dal.listSalesmen(db).length > 0) {
            throw new RuleViolationError(
                "The lounge already has a salesman; a new one is added by one of them",
            )
        }

        // Nobody else exists yet to be recorded against
        const id = newId()
        return dal.insertSalesman(db, { id, ...fields, isActive: true }, id)
    })
}

/**
 * Creates a salesman and records their first snapshot.
 *
 * @param command - Raw input matching {@link createSalesmanSchema}.
 * @returns The stored salesman.
 * @throws {@link InvalidInputError} If the input is not valid.
 * @throws {@link NotFoundError} If the salesman making the change does not exist.
 * @throws {@link InactiveError} If that salesman is inactive.
 */
export function createSalesman(db: DB, command: CreateSalesmanCommand): SalesmanRow {
    const { changedBy, ...fields } = validate(createSalesmanSchema, command)

    return dal.inTransaction(db, () => {
        requireActiveSalesman(db, changedBy)
        return dal.insertSalesman(db, { id: newId(), ...fields }, changedBy)
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
