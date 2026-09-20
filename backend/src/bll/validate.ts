/**
 * Input validation: the first layer of every business operation.
 *
 * Checks shape and boundaries only (types, ranges, required fields). Rules that
 * need stored data live with the operation that enforces them.
 */

import type { z } from "zod"
import { InvalidInputError } from "./errors.js"

/**
 * Parses input against a schema.
 *
 * @param schema - Schema describing the expected input.
 * @param input - Raw, untrusted input.
 * @returns The parsed value, with defaults applied.
 * @throws {@link InvalidInputError} If the input does not match the schema.
 */
export function validate<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
    const result = schema.safeParse(input)
    if (!result.success) {
        const details = result.error.issues
            .map((issue) => {
                const path = issue.path.join(".")
                return path ? `${path}: ${issue.message}` : issue.message
            })
            .join("; ")
        throw new InvalidInputError(details)
    }
    return result.data
}
