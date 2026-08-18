/**
 * Integration test factory for tRPC procedures using in-memory SQLite database (`:memory:`).
 */

import type { DB } from "../../src/dal/index.js"
import { appRouter, createCallerFactory, createContext } from "../../src/trpc/index.js"
import { createTestDb } from "../dal/setup.js"

const createCaller = createCallerFactory(appRouter)

/**
 * Creates a direct tRPC caller client connected to an in-memory SQLite test database.
 *
 * @returns Object containing the in-memory `db` instance and typed `caller` client.
 */
export function createTestCaller() {
    const db: DB = createTestDb()
    const context = createContext(db)
    const caller = createCaller(context)
    return { db, caller }
}
