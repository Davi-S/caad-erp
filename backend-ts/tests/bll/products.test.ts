/**
 * Unit test suite for Product BLL handlers (`src/bll/products.ts`).
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    DuplicateProductError,
    InvalidAttributeError,
    InvalidMonetaryValueError,
    ProductNotFoundError,
    addProduct,
    getProduct,
    listProducts,
    updateProduct,
} from "../../src/bll/index.js"
import type { DB } from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Products BLL Handlers", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
    })

    it("GIVEN a fresh database WHEN listProducts is called THEN returns empty array", () => {
        // Arrange & Act
        const result = listProducts(db)

        // Assert
        expect(result).toHaveLength(0)
    })

    it("GIVEN registered products WHEN listProducts is called THEN returns all product records", () => {
        // Arrange
        addProduct(db, {
            productId: "P-001",
            productName: "Soda",
            sellPrice: 500,
            isActive: true,
        })
        addProduct(db, {
            productId: "P-002",
            productName: "Chips",
            sellPrice: 300,
            isActive: false,
        })

        // Act
        const result = listProducts(db)

        // Assert
        expect(result).toHaveLength(2)
        expect(result[0].productId).toBe("P-001")
        expect(result[1].productId).toBe("P-002")
    })

    it("GIVEN an existing product WHEN getProduct is called THEN returns the matching product record", () => {
        // Arrange
        addProduct(db, {
            productId: "P-001",
            productName: "Soda",
            sellPrice: 500,
            isActive: true,
        })

        // Act
        const product = getProduct(db, "P-001")

        // Assert
        expect(product.productId).toBe("P-001")
        expect(product.productName).toBe("Soda")
        expect(product.sellPrice).toBe(500)
        expect(product.isActive).toBe(true)
    })

    it("GIVEN a non-existent product ID WHEN getProduct is called THEN throws ProductNotFoundError", () => {
        // Arrange & Act & Assert
        expect(() => getProduct(db, "P-999")).toThrow(ProductNotFoundError)
    })

    it("GIVEN valid input command WHEN addProduct is called THEN registers and returns the new product", () => {
        // Arrange
        const command = {
            productId: "P-001",
            productName: "Chocolate Bar",
            sellPrice: 250,
            isActive: true,
        }

        // Act
        const created = addProduct(db, command)

        // Assert
        expect(created.productId).toBe("P-001")
        expect(created.productName).toBe("Chocolate Bar")
        expect(created.sellPrice).toBe(250)
        expect(created.isActive).toBe(true)
        expect(getProduct(db, "P-001")).toEqual(created)
    })

    it("GIVEN empty product ID WHEN addProduct is called THEN throws InvalidAttributeError", () => {
        // Arrange
        const command = {
            productId: "   ",
            productName: "Chocolate Bar",
            sellPrice: 250,
            isActive: true,
        }

        // Act & Assert
        expect(() => addProduct(db, command)).toThrow(InvalidAttributeError)
    })

    it("GIVEN empty product name WHEN addProduct is called THEN throws InvalidAttributeError", () => {
        // Arrange
        const command = {
            productId: "P-001",
            productName: "",
            sellPrice: 250,
            isActive: true,
        }

        // Act & Assert
        expect(() => addProduct(db, command)).toThrow(InvalidAttributeError)
    })

    it("GIVEN negative sell price WHEN addProduct is called THEN throws InvalidMonetaryValueError", () => {
        // Arrange
        const command = {
            productId: "P-001",
            productName: "Chocolate Bar",
            sellPrice: -50,
            isActive: true,
        }

        // Act & Assert
        expect(() => addProduct(db, command)).toThrow(InvalidMonetaryValueError)
    })

    it("GIVEN non-integer sell price WHEN addProduct is called THEN throws InvalidMonetaryValueError", () => {
        // Arrange
        const command = {
            productId: "P-001",
            productName: "Chocolate Bar",
            sellPrice: 12.5,
            isActive: true,
        } as any

        // Act & Assert
        expect(() => addProduct(db, command)).toThrow(InvalidMonetaryValueError)
    })

    it("GIVEN a duplicate product ID WHEN addProduct is called THEN throws DuplicateProductError", () => {
        // Arrange
        addProduct(db, {
            productId: "P-001",
            productName: "Soda",
            sellPrice: 500,
            isActive: true,
        })

        // Act & Assert
        expect(() =>
            addProduct(db, {
                productId: "P-001",
                productName: "Soda Copy",
                sellPrice: 600,
                isActive: true,
            }),
        ).toThrow(DuplicateProductError)
    })

    it("GIVEN valid update command WHEN updateProduct is called THEN updates product fields in database", () => {
        // Arrange
        addProduct(db, {
            productId: "P-001",
            productName: "Soda",
            sellPrice: 500,
            isActive: true,
        })

        // Act
        const updated = updateProduct(db, "P-001", {
            productName: "Super Soda",
            sellPrice: 550,
        })

        // Assert
        expect(updated.productName).toBe("Super Soda")
        expect(updated.sellPrice).toBe(550)
        expect(updated.isActive).toBe(true)
        expect(getProduct(db, "P-001")).toEqual(updated)
    })

    it("GIVEN non-existent product ID WHEN updateProduct is called THEN throws ProductNotFoundError", () => {
        // Arrange & Act & Assert
        expect(() => updateProduct(db, "P-999", { productName: "Updated Name" })).toThrow(
            ProductNotFoundError,
        )
    })

    it("GIVEN negative sell price in update WHEN updateProduct is called THEN throws InvalidMonetaryValueError", () => {
        // Arrange
        addProduct(db, {
            productId: "P-001",
            productName: "Soda",
            sellPrice: 500,
            isActive: true,
        })

        // Act & Assert
        expect(() => updateProduct(db, "P-001", { sellPrice: -100 })).toThrow(
            InvalidMonetaryValueError,
        )
    })
})
