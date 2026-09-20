/**
 * Identifier generation.
 */

import { v7 as uuidv7 } from "uuid"

/**
 * Creates an identifier for a new record.
 *
 * UUID v7 is time-ordered, which keeps inserts local in the index. Nothing may
 * read meaning into it: an ID only identifies.
 *
 * @returns A new unique identifier.
 */
export function newId(): string {
    return uuidv7()
}
