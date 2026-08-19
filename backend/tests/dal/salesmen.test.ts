import { beforeEach, describe, expect, it } from "vitest"
import {
    appendSalesman,
    getSalesman,
    listSalesmen,
    updateSalesman,
    type DB,
    type SalesmanRow,
} from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Salesmen DAL", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
    })

    const sampleSalesman: SalesmanRow = {
        id: "S-001",
        name: "John Doe",
        isActive: true,
    }

    describe("listSalesmen", () => {
        it("GIVEN an empty salesmen table WHEN listSalesmen is called THEN returns empty array", () => {
            // Arrange (Empty database created in beforeEach)

            // Act
            const records = listSalesmen(db)

            // Assert
            expect(records).toEqual([])
        })

        it("GIVEN populated salesman rows WHEN listSalesmen is called THEN returns all salesman records", () => {
            // Arrange
            appendSalesman(db, sampleSalesman)
            appendSalesman(db, {
                id: "S-002",
                name: "Jane Smith",
                isActive: false,
            })

            // Act
            const records = listSalesmen(db)

            // Assert
            expect(records.length).toBe(2)
            expect(records[0]).toEqual(sampleSalesman)
            expect(records[1].id).toBe("S-002")
        })
    })

    describe("getSalesman", () => {
        it("GIVEN an existing id WHEN getSalesman is called THEN returns matching SalesmanRow", () => {
            // Arrange
            appendSalesman(db, sampleSalesman)

            // Act
            const record = getSalesman(db, "S-001")

            // Assert
            expect(record).toEqual(sampleSalesman)
        })

        it("GIVEN a non-existent id WHEN getSalesman is called THEN returns undefined", () => {
            // Arrange (No salesman inserted)

            // Act
            const record = getSalesman(db, "S-999")

            // Assert
            expect(record).toBeUndefined()
        })
    })

    describe("appendSalesman", () => {
        it("GIVEN a valid salesman record WHEN appendSalesman is called THEN increases row count and persists attributes", () => {
            // Arrange
            const beforeCount = listSalesmen(db).length

            // Act
            const created = appendSalesman(db, sampleSalesman)

            // Assert
            expect(listSalesmen(db).length).toBe(beforeCount + 1)
            expect(created).toEqual(sampleSalesman)
        })

        it("GIVEN a salesman record with isActive false WHEN appendSalesman is called THEN persists boolean isActive accurately", () => {
            // Arrange
            const inactiveSalesman: SalesmanRow = {
                id: "S-010",
                name: "Bob Vance",
                isActive: false,
            }

            // Act
            appendSalesman(db, inactiveSalesman)
            const fetched = getSalesman(db, "S-010")

            // Assert
            expect(fetched?.isActive).toBe(false)
            expect(typeof fetched?.isActive).toBe("boolean")
        })

        it("GIVEN an existing id WHEN appending a duplicate salesman THEN throws SQLite constraint error", () => {
            // Arrange
            appendSalesman(db, sampleSalesman)

            // Act & Assert
            expect(() => appendSalesman(db, sampleSalesman)).toThrow()
        })
    })

    describe("updateSalesman", () => {
        it("GIVEN an existing salesman WHEN updateSalesman is called for a single field THEN updates only that field", () => {
            // Arrange
            appendSalesman(db, sampleSalesman)

            // Act
            const updated = updateSalesman(db, "S-001", { name: "John H. Doe" })

            // Assert
            expect(updated.name).toBe("John H. Doe")
            expect(updated.isActive).toBe(true)
        })

        it("GIVEN an existing salesman WHEN updateSalesman is called for multiple fields THEN updates all requested fields", () => {
            // Arrange
            appendSalesman(db, sampleSalesman)

            // Act
            const updated = updateSalesman(db, "S-001", {
                name: "John H. Doe",
                isActive: false,
            })

            // Assert
            expect(updated.name).toBe("John H. Doe")
            expect(updated.isActive).toBe(false)
        })

        it("GIVEN a non-existent id WHEN updateSalesman is called THEN throws missing salesman error", () => {
            // Arrange (No salesman inserted)

            // Act & Assert
            expect(() => updateSalesman(db, "S-999", { name: "Unknown" })).toThrow(
                "Salesman not found: S-999",
            )
        })

        it("GIVEN an empty fieldValues payload WHEN updateSalesman is called THEN throws strict empty update payload error", () => {
            // Arrange
            appendSalesman(db, sampleSalesman)

            // Act & Assert
            expect(() => updateSalesman(db, "S-001", {})).toThrow(
                "At least one field must be provided to update salesman: S-001",
            )
        })
    })
})
