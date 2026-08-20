/**
 * Shared validation runner mapping Zod validation failures to domain exceptions.
 */

import type { z } from "zod"
import { BusinessRuleViolationError, InvalidAttributeError } from "./errors.js"

/**
 * Validates raw data against a Zod schema and transforms Zod errors into domain exception classes
 * using custom `params.errorClass` metadata attached to schema rules.
 *
 * @param schema - The Zod schema to validate against.
 * @param data - The raw input data to validate.
 * @returns The parsed and typed data payload.
 * @throws {@link BusinessRuleViolationError} Subclass specified by `params.errorClass` metadata, or {@link InvalidAttributeError} for structural type mismatches.
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        const firstIssue = result.error.issues[0]
        const message = firstIssue.message

        // Extract explicit params.errorClass metadata attached to the failing Zod rule
        const params = (
            firstIssue as {
                params?: { errorClass?: typeof BusinessRuleViolationError }
            }
        ).params
        if (params?.errorClass) {
            const CustomClass = params.errorClass
            throw new CustomClass(message)
        }

        // Default fallback for root structural type mismatches (e.g. passing non-object payloads)
        throw new InvalidAttributeError(message)
    }
    return result.data
}
