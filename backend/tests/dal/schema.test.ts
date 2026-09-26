/**
 * Unit test suite for the tables: that `schema.ts` still mirrors `ddl.ts`, and
 * that the tables carry what the design promises.
 *
 * `ddl.ts` is the single source of truth and `schema.ts` is a hand-written mirror
 * of it, so nothing but a test keeps the two from drifting apart.
 */

import { getTableName, is } from "drizzle-orm"
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core"
import { beforeEach, describe, expect, it } from "vitest"
import * as schema from "../../src/dal/schema.js"
import { freshDb } from "../fixtures.js"
import type Database from "better-sqlite3"

interface ColumnInfo {
    name: string
    type: string
    notnull: number
    pk: number
}

interface ForeignKeyInfo {
    table: string
    from: string
    to: string
}

interface IndexInfo {
    name: string
    unique: number
}

const mirrored = Object.values(schema)
    .filter((value) => is(value, SQLiteTable))
    .map((table) => getTableConfig(table))

let sqlite: Database.Database

beforeEach(() => {
    sqlite = freshDb().$client
})

function pragma<T>(statement: string): T[] {
    return sqlite.pragma(statement) as T[]
}

function createdTables(): string[] {
    return sqlite
        .prepare<[], { name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((row) => row.name)
}

/** The columns an index covers, in order. */
function indexedColumns(index: string): string[] {
    return pragma<{ name: string }>(`index_info(${index})`).map((column) => column.name)
}

describe("the created tables", () => {
    it("GIVEN the schema is applied THEN every table has a mirror in schema.ts, and the other way round", () => {
        expect(createdTables().sort()).toEqual(mirrored.map((table) => table.name).sort())
    })

    it("GIVEN a mirrored table THEN it declares the same columns as the table that was created", () => {
        for (const table of mirrored) {
            const created = pragma<ColumnInfo>(`table_info(${table.name})`)
            expect(created.map((column) => column.name).sort()).toEqual(
                table.columns.map((column) => column.name).sort(),
            )
        }
    })

    it("GIVEN a mirrored column THEN its type, nullability and primary key match the created one", () => {
        for (const table of mirrored) {
            const created = pragma<ColumnInfo>(`table_info(${table.name})`)
            for (const column of table.columns) {
                const stored = created.find((candidate) => candidate.name === column.name)!
                const where = `${table.name}.${column.name}`

                expect(stored.type.toLowerCase(), where).toBe(column.getSQLType().toLowerCase())
                // A primary key is never null in either description of it
                expect(stored.notnull === 1 || stored.pk > 0, where).toBe(
                    column.notNull || column.primary,
                )
                expect(stored.pk > 0, where).toBe(column.primary)
            }
        }
    })

    it("GIVEN a mirrored reference THEN the created table has the same foreign key", () => {
        for (const table of mirrored) {
            const created = pragma<ForeignKeyInfo>(`foreign_key_list(${table.name})`)
            const declared = table.foreignKeys.map((key) => {
                const reference = key.reference()
                return `${reference.columns[0].name} -> ${getTableName(reference.foreignTable)}.${reference.foreignColumns[0].name}`
            })

            expect(
                created.map((key) => `${key.from} -> ${key.table}.${key.to}`).sort(),
                table.name,
            ).toEqual(declared.sort())
        }
    })

    it("GIVEN a mirrored column that is unique THEN the created table enforces it", () => {
        const unique = mirrored.flatMap((table) =>
            table.columns.filter((column) => column.isUnique).map((column) => ({ table, column })),
        )
        // Nothing to compare against if the mirror stopped saying it
        expect(unique.length).toBeGreaterThan(0)

        for (const { table, column } of unique) {
            const enforcing = pragma<IndexInfo>(`index_list(${table.name})`)
                .filter((index) => index.unique === 1)
                .map((index) => indexedColumns(index.name))

            expect(enforcing, `${table.name}.${column.name}`).toContainEqual([column.name])
        }
    })
})

describe("the indexes", () => {
    it("GIVEN a foreign key THEN a column of its own is indexed, so joins and link lookups do not scan", () => {
        for (const table of mirrored) {
            const indexes = pragma<IndexInfo>(`index_list(${table.name})`).map((index) =>
                indexedColumns(index.name),
            )

            for (const key of pragma<ForeignKeyInfo>(`foreign_key_list(${table.name})`)) {
                const covered = indexes.some((columns) => columns[0] === key.from)
                // A primary key needs no index of its own: it is the table's own key
                const isPrimaryKey = pragma<ColumnInfo>(`table_info(${table.name})`).some(
                    (column) => column.name === key.from && column.pk > 0,
                )

                expect(covered || isPrimaryKey, `${table.name}.${key.from}`).toBe(true)
            }
        }
    })
})
