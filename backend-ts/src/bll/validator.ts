/**
 * Shared validation runner mapping Zod validation failures to domain exceptions.
 */

import type { z } from "zod"
import { InvalidAttributeError, InvalidMonetaryValueError, InvalidQuantityError } from "./errors.js"

/**
 * Validates raw data against a Zod schema and transforms Zod errors into domain exception classes.
 *
 * @param schema - The Zod schema to validate against.
 * @param data - The raw input data to validate.
 * @returns The parsed and typed data payload.
 * @throws {@link InvalidAttributeError} If attribute validation fails.
 * @throws {@link InvalidMonetaryValueError} If monetary validation fails.
 * @throws {@link InvalidQuantityError} If quantity validation fails.
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        const firstIssue = result.error.issues[0]
        const message = firstIssue.message

        if (message.toLowerCase().includes("quantity")) {
            throw new InvalidQuantityError(message)
        }
        if (
            message.toLowerCase().includes("price") ||
            message.toLowerCase().includes("amount") ||
            message.toLowerCase().includes("revenue") ||
            message.toLowerCase().includes("cost")
        ) {
            throw new InvalidMonetaryValueError(message)
        }
        throw new InvalidAttributeError(message)
    }
    return result.data
}
