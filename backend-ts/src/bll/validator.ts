/**
 * Shared validation runner mapping Zod validation failures to domain exceptions.
 */

import type { z } from "zod"
import {
    BusinessRuleViolationError,
    InvalidAttributeError,
    InvalidMonetaryValueError,
    InvalidQuantityError,
} from "./errors.js"

/**
 * Validates raw data against a Zod schema and transforms Zod errors into domain exception classes
 * using custom `params.errorClass` metadata attached to schema rules, with fallback field-name mapping.
 *
 * @param schema - The Zod schema to validate against.
 * @param data - The raw input data to validate.
 * @returns The parsed and typed data payload.
 * @throws {@link BusinessRuleViolationError} Subclass specified by `params.errorClass` or inferred field type.
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        const firstIssue = result.error.issues[0]
        const message = firstIssue.message

        // Check for explicit params.errorClass metadata
        const params = (
            firstIssue as {
                params?: { errorClass?: typeof BusinessRuleViolationError }
            }
        ).params
        if (params?.errorClass) {
            const CustomClass = params.errorClass
            throw new CustomClass(message)
        }

        // Fallback to deterministic field-name mapping
        const fieldName = String(firstIssue.path[0] ?? "").toLowerCase()
        if (fieldName.includes("quantity")) {
            throw new InvalidQuantityError(message)
        }
        if (
            fieldName.includes("price") ||
            fieldName.includes("revenue") ||
            fieldName.includes("cost") ||
            fieldName.includes("amount")
        ) {
            throw new InvalidMonetaryValueError(message)
        }

        throw new InvalidAttributeError(message)
    }
    return result.data
}
