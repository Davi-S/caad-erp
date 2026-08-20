/**
 * tRPC Request Context definition and factory function.
 */

import type { DB } from "../dal/index.js"

export interface Context {
    db: DB
}

/**
 * Creates the request context containing the active SQLite database instance.
 *
 * @param db - Active database client instance.
 * @returns The populated {@link Context} object.
 */
export function createContext(db: DB): Context {
    return { db }
}
