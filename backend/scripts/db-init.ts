/**
 * Database initializer script.
 *
 * Replaces any existing SQLite database at the given path (default: caad_erp.db)
 * with a fresh file containing the full application schema and zero data rows.
 *
 * Usage:
 *   npx tsx scripts/db-init.ts [path/to/db.sqlite]
 */

import { rmSync } from "fs"
import { resolve } from "path"
import { applySchema, createDb } from "../src/dal/index.js"

const resolvedPath = resolve(process.argv[2] ?? "caad_erp.db")

// Remove existing database and WAL sidecar files if present
for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(resolvedPath + suffix, { force: true })
}

console.log(`Initializing empty database at: ${resolvedPath}`)

const sqlite = createDb(resolvedPath).$client
applySchema(sqlite)
sqlite.pragma("wal_checkpoint(TRUNCATE)")
sqlite.close()

console.log("Done. Schema applied, no data inserted.")
