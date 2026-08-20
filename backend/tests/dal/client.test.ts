import { describe, expect, it } from "vitest"
import fs from "fs"
import path from "path"
import { createDb } from "../../src/dal/client.js"

describe("DAL Client", () => {
    it("initializes database connection with default parameter and custom in-memory path", () => {
        // Test custom path
        const memDb = createDb(":memory:")
        expect(memDb).toBeDefined()

        // Test default parameter dbPath = "caad_erp.db"
        const defaultDbPath = path.resolve(process.cwd(), "test_default_db.db")
        try {
            const defaultDb = createDb(defaultDbPath)
            expect(defaultDb).toBeDefined()
        } finally {
            if (fs.existsSync(defaultDbPath)) {
                fs.unlinkSync(defaultDbPath)
            }
        }
    })
})
