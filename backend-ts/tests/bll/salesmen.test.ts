/**
 * Unit test suite for Salesman BLL handlers (`src/bll/salesmen.ts`).
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    DuplicateSalesmanError,
    InvalidAttributeError,
    SalesmanNotFoundError,
    addSalesman,
    getSalesman,
    listSalesmen,
    updateSalesman,
} from "../../src/bll/index.js"
import type { DB } from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Salesmen BLL Handlers", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
    })

    it("GIVEN a fresh database WHEN listSalesmen is called THEN returns empty array", () => {
        // Arrange & Act
        const result = listSalesmen(db)

        // Assert
        expect(result).toHaveLength(0)
    })

    it("GIVEN registered salesmen WHEN listSalesmen is called THEN returns all salesman records", () => {
        // Arrange
        addSalesman(db, {
            salesmanId: "S-001",
            salesmanName: "Alice",
            isActive: true,
        })
        addSalesman(db, {
            salesmanId: "S-002",
            salesmanName: "Bob",
            isActive: false,
        })

        // Act
        const result = listSalesmen(db)

        // Assert
        expect(result).toHaveLength(2)
        expect(result[0].salesmanId).toBe("S-001")
        expect(result[1].salesmanId).toBe("S-002")
    })

    it("GIVEN an existing salesman WHEN getSalesman is called THEN returns the matching salesman record", () => {
        // Arrange
        addSalesman(db, {
            salesmanId: "S-001",
            salesmanName: "Alice",
            isActive: true,
        })

        // Act
        const salesman = getSalesman(db, "S-001")

        // Assert
        expect(salesman.salesmanId).toBe("S-001")
        expect(salesman.salesmanName).toBe("Alice")
        expect(salesman.isActive).toBe(true)
    })

    it("GIVEN a non-existent salesman ID WHEN getSalesman is called THEN throws SalesmanNotFoundError", () => {
        // Arrange & Act & Assert
        expect(() => getSalesman(db, "S-999")).toThrow(SalesmanNotFoundError)
    })

    it("GIVEN valid input command WHEN addSalesman is called THEN registers and returns the new salesman", () => {
        // Arrange
        const command = {
            salesmanId: "S-001",
            salesmanName: "Charlie",
            isActive: true,
        }

        // Act
        const created = addSalesman(db, command)

        // Assert
        expect(created.salesmanId).toBe("S-001")
        expect(created.salesmanName).toBe("Charlie")
        expect(created.isActive).toBe(true)
        expect(getSalesman(db, "S-001")).toEqual(created)
    })

    it("GIVEN empty salesman ID WHEN addSalesman is called THEN throws InvalidAttributeError", () => {
        // Arrange
        const command = {
            salesmanId: "   ",
            salesmanName: "Charlie",
            isActive: true,
        }

        // Act & Assert
        expect(() => addSalesman(db, command)).toThrow(InvalidAttributeError)
    })

    it("GIVEN empty salesman name WHEN addSalesman is called THEN throws InvalidAttributeError", () => {
        // Arrange
        const command = {
            salesmanId: "S-001",
            salesmanName: "",
            isActive: true,
        }

        // Act & Assert
        expect(() => addSalesman(db, command)).toThrow(InvalidAttributeError)
    })

    it("GIVEN a duplicate salesman ID WHEN addSalesman is called THEN throws DuplicateSalesmanError", () => {
        // Arrange
        addSalesman(db, {
            salesmanId: "S-001",
            salesmanName: "Alice",
            isActive: true,
        })

        // Act & Assert
        expect(() =>
            addSalesman(db, {
                salesmanId: "S-001",
                salesmanName: "Alice Copy",
                isActive: true,
            }),
        ).toThrow(DuplicateSalesmanError)
    })

    it("GIVEN valid update command WHEN updateSalesman is called THEN updates salesman fields in database", () => {
        // Arrange
        addSalesman(db, {
            salesmanId: "S-001",
            salesmanName: "Alice",
            isActive: true,
        })

        // Act
        const updated = updateSalesman(db, "S-001", {
            salesmanName: "Alice Smith",
            isActive: false,
        })

        // Assert
        expect(updated.salesmanName).toBe("Alice Smith")
        expect(updated.isActive).toBe(false)
        expect(getSalesman(db, "S-001")).toEqual(updated)
    })

    it("GIVEN non-existent salesman ID WHEN updateSalesman is called THEN throws SalesmanNotFoundError", () => {
        // Arrange & Act & Assert
        expect(() => updateSalesman(db, "S-999", { salesmanName: "Updated Name" })).toThrow(
            SalesmanNotFoundError,
        )
    })
})
