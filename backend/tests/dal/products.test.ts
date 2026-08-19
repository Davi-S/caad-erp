import { beforeEach, describe, expect, it } from "vitest"
import {
    appendProduct,
    getProduct,
    listProducts,
    updateProduct,
    type DB,
    type ProductRow,
} from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Products DAL", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
    })

    const sampleProduct: ProductRow = {
        id: "P-001",
        name: "Soda",
        sellPrice: 550,
        isActive: true,
    }

    describe("listProducts", () => {
        it("GIVEN an empty products table WHEN listProducts is called THEN returns empty array", () => {
            // Arrange (Empty database created in beforeEach)

            // Act
            const records = listProducts(db)

            // Assert
            expect(records).toEqual([])
        })

        it("GIVEN populated product rows WHEN listProducts is called THEN returns all product records", () => {
            // Arrange
            appendProduct(db, sampleProduct)
            appendProduct(db, {
                id: "P-002",
                name: "Juice",
                sellPrice: 600,
                isActive: false,
            })

            // Act
            const records = listProducts(db)

            // Assert
            expect(records.length).toBe(2)
            expect(records[0]).toEqual(sampleProduct)
            expect(records[1].id).toBe("P-002")
        })
    })

    describe("getProduct", () => {
        it("GIVEN an existing id WHEN getProduct is called THEN returns matching ProductRow", () => {
            // Arrange
            appendProduct(db, sampleProduct)

            // Act
            const record = getProduct(db, "P-001")

            // Assert
            expect(record).toEqual(sampleProduct)
        })

        it("GIVEN a non-existent id WHEN getProduct is called THEN returns undefined", () => {
            // Arrange (No product inserted)

            // Act
            const record = getProduct(db, "P-999")

            // Assert
            expect(record).toBeUndefined()
        })
    })

    describe("appendProduct", () => {
        it("GIVEN a valid product record WHEN appendProduct is called THEN increases row count and persists attributes", () => {
            // Arrange
            const beforeCount = listProducts(db).length

            // Act
            const created = appendProduct(db, sampleProduct)

            // Assert
            expect(listProducts(db).length).toBe(beforeCount + 1)
            expect(created).toEqual(sampleProduct)
        })

        it("GIVEN a product record with isActive false WHEN appendProduct is called THEN persists boolean isActive accurately", () => {
            // Arrange
            const inactiveProduct: ProductRow = {
                id: "P-010",
                name: "Energy Drink",
                sellPrice: 990,
                isActive: false,
            }

            // Act
            appendProduct(db, inactiveProduct)
            const fetched = getProduct(db, "P-010")

            // Assert
            expect(fetched?.isActive).toBe(false)
            expect(typeof fetched?.isActive).toBe("boolean")
        })

        it("GIVEN an existing id WHEN appending a duplicate product THEN throws SQLite constraint error", () => {
            // Arrange
            appendProduct(db, sampleProduct)

            // Act & Assert
            expect(() => appendProduct(db, sampleProduct)).toThrow()
        })
    })

    describe("updateProduct", () => {
        it("GIVEN an existing product WHEN updateProduct is called for a single field THEN updates only that field", () => {
            // Arrange
            appendProduct(db, sampleProduct)

            // Act
            const updated = updateProduct(db, "P-001", { name: "Soda Zero" })

            // Assert
            expect(updated.name).toBe("Soda Zero")
            expect(updated.sellPrice).toBe(550)
            expect(updated.isActive).toBe(true)
        })

        it("GIVEN an existing product WHEN updateProduct is called for multiple fields THEN updates all requested fields", () => {
            // Arrange
            appendProduct(db, sampleProduct)

            // Act
            const updated = updateProduct(db, "P-001", {
                name: "Soda Zero",
                sellPrice: 625,
            })

            // Assert
            expect(updated.name).toBe("Soda Zero")
            expect(updated.sellPrice).toBe(625)
        })

        it("GIVEN a non-existent id WHEN updateProduct is called THEN throws missing product error", () => {
            // Arrange (No product inserted)

            // Act & Assert
            expect(() => updateProduct(db, "P-999", { name: "Unknown" })).toThrow(
                "Product not found: P-999",
            )
        })

        it("GIVEN an empty fieldValues payload WHEN updateProduct is called THEN throws strict empty update payload error", () => {
            // Arrange
            appendProduct(db, sampleProduct)

            // Act & Assert
            expect(() => updateProduct(db, "P-001", {})).toThrow(
                "At least one field must be provided to update product: P-001",
            )
        })
    })
})
