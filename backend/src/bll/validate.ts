/**
 * Input validation: the contract with the caller.
 *
 * Checks the shape of a request: types, whole numbers, ranges, required fields,
 * trimming and defaults. A failure here means the caller sent something wrong, so
 * the message names the field to fix.
 *
 * It speaks the caller's language ("write off 2 units"), while the ledger rules
 * speak the storage language ("this line's quantity is -2"). Both have an opinion
 * on a few values; see `ledger/rules.ts`.
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
