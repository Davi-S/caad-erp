/**
 * Salesmen domain handlers coordinating validation, business rules, and persistence.
 *
 * Implements high-level salesman workflows (`listSalesmen`, `getSalesman`, `addSalesman`,
 * `updateSalesman`) by colocating Zod command schemas, domain invariant rules, and
 * Data Access Layer (DAL) execution.
 */

import { z } from "zod"
import type { DB, SalesmanRow } from "../dal/index.js"
import * as dal from "../dal/index.js"
import { DuplicateSalesmanError, InvalidAttributeError, SalesmanNotFoundError } from "./errors.js"
import { validateSchema } from "./validator.js"

/**
 * Retrieves all salesman records from the catalog.
 *
 * @param db - Active database client instance.
 * @returns Array of all {@link SalesmanRow} items.
 */
export function listSalesmen(db: DB): SalesmanRow[] {
    return dal.listSalesmen(db)
}

/**
 * Retrieves a single salesman record by identifier.
 *
 * @param db - Active database client instance.
 * @param salesmanId - Unique salesman identifier.
 * @returns The matching {@link SalesmanRow}.
 * @throws {@link SalesmanNotFoundError} If no salesman exists with the given ID.
 */
export function getSalesman(db: DB, salesmanId: string): SalesmanRow {
    const salesman = dal.getSalesman(db, salesmanId)
    if (!salesman) {
        throw new SalesmanNotFoundError(`Unknown salesman id: ${salesmanId}`)
    }
    return salesman
}

/**
 * Zod validation schema and command payload for registering a new salesman.
 */
export const addSalesmanSchema = z.object({
    salesmanId: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Salesman ID must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    salesmanName: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Salesman name must be provided",
            params: { errorClass: InvalidAttributeError },
        }),
    isActive: z.boolean(),
})

export type AddSalesmanCommand = z.infer<typeof addSalesmanSchema>

/**
 * Validates input payload and registers a new salesman in the catalog.
 *
 * @param db - Active database client instance.
 * @param command - Raw input object matching {@link AddSalesmanCommand}.
 * @returns The newly created and persisted {@link SalesmanRow}.
 * @throws {@link InvalidAttributeError} If salesman ID or name are empty.
 * @throws {@link DuplicateSalesmanError} If a salesman with the same ID already exists.
 */
export function addSalesman(db: DB, command: AddSalesmanCommand): SalesmanRow {
    // Validate input payload structure and boundary types using Zod
    const validated = validateSchema(addSalesmanSchema, command)

    // Enforce domain rule checking for duplicate salesman identifier
    const existing = dal.getSalesman(db, validated.salesmanId)
    if (existing) {
        throw new DuplicateSalesmanError(`Salesman already exists: ${validated.salesmanId}`)
    }

    // Persist new salesman record in SQLite database
    return dal.appendSalesman(db, validated)
}

/**
 * Zod validation schema and command payload for updating selected fields of a salesman.
 */
export const updateSalesmanSchema = z.object({
    salesmanName: z
        .string()
        .trim()
        .refine((val) => val.length >= 1, {
            message: "Salesman name must be provided",
            params: { errorClass: InvalidAttributeError },
        })
        .optional(),
    isActive: z.boolean().optional(),
})

export type UpdateSalesmanCommand = z.infer<typeof updateSalesmanSchema>

/**
 * Validates update payload and modifies an existing salesman in the catalog.
 *
 * @param db - Active database client instance.
 * @param salesmanId - Unique identifier of the salesman to update.
 * @param command - Raw update object matching {@link UpdateSalesmanCommand}.
 * @returns The updated and persisted {@link SalesmanRow}.
 * @throws {@link SalesmanNotFoundError} If the target salesman does not exist.
 * @throws {@link InvalidAttributeError} If empty string values are provided.
 */
export function updateSalesman(
    db: DB,
    salesmanId: string,
    command: UpdateSalesmanCommand,
): SalesmanRow {
    // Validate input payload structure using Zod
    const validated = validateSchema(updateSalesmanSchema, command)

    // Enforce domain rule ensuring target salesman exists in catalog
    getSalesman(db, salesmanId)

    // Execute SQL update in SQLite database
    return dal.updateSalesman(db, salesmanId, validated)
}
