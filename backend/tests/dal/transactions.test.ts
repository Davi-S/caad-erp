import { beforeEach, describe, expect, it } from "vitest"
import {
    appendProduct,
    appendSalesman,
    appendTransaction,
    listTransactions,
    type DB,
    type TransactionRow,
} from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Transactions DAL", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
        // Seed foreign key parent entities
        appendProduct(db, {
            id: "P-001",
            name: "Soda",
            sellPrice: 550,
            isActive: true,
        })
        appendSalesman(db, {
            id: "S-001",
            name: "John Doe",
            isActive: true,
        })
    })

    const sampleTransaction: TransactionRow = {
        id: "TX-100",
        timestampIso: "2026-08-17T12:00:00.000Z",
        transactionType: "SALE",
        productId: "P-001",
        salesmanId: "S-001",
        paymentType: "Cash",
        quantityChange: -1,
        totalRevenue: 550,
        totalCost: 300,
        linkedTransactionId: null,
        notes: "Regular sale",
    }

    describe("listTransactions", () => {
        it("GIVEN an empty transaction log table WHEN listTransactions is called THEN returns empty array", () => {
            // Arrange (Empty database created in beforeEach)

            // Act
            const records = listTransactions(db)

            // Assert
            expect(records).toEqual([])
        })

        it("GIVEN populated transaction rows WHEN listTransactions is called THEN returns all recorded transactions in table order", () => {
            // Arrange
            appendTransaction(db, sampleTransaction)

            // Act
            const records = listTransactions(db)

            // Assert
            expect(records.length).toBe(1)
            expect(records[0]).toEqual(sampleTransaction)
        })
    })

    describe("appendTransaction", () => {
        it("GIVEN a valid transaction record WHEN appendTransaction is called THEN increases row count and persists attributes", () => {
            // Arrange
            const beforeCount = listTransactions(db).length

            // Act
            const created = appendTransaction(db, sampleTransaction)

            // Assert
            expect(listTransactions(db).length).toBe(beforeCount + 1)
            expect(created).toEqual(sampleTransaction)
        })

        it("GIVEN optional fields as null WHEN appendTransaction is called THEN persists null values accurately", () => {
            // Arrange
            const transactionWithNulls: TransactionRow = {
                id: "TX-101",
                timestampIso: "2026-08-17T12:05:00.000Z",
                transactionType: "RESTOCK",
                productId: "P-001",
                salesmanId: "S-001",
                paymentType: null,
                quantityChange: 10,
                totalRevenue: 0,
                totalCost: 3000,
                linkedTransactionId: null,
                notes: null,
            }

            // Act
            const created = appendTransaction(db, transactionWithNulls)

            // Assert
            expect(created.paymentType).toBeNull()
            expect(created.linkedTransactionId).toBeNull()
            expect(created.notes).toBeNull()

            const fetched = listTransactions(db).find((t) => t.id === "TX-101")
            expect(fetched?.paymentType).toBeNull()
        })

        it("GIVEN a transaction with linkedTransactionId and valid enums WHEN appendTransaction is called THEN persists all fields accurately", () => {
            // Arrange
            const refundTransaction: TransactionRow = {
                id: "TX-102",
                timestampIso: "2026-08-17T12:10:00.000Z",
                transactionType: "VOID",
                productId: "P-001",
                salesmanId: "S-001",
                paymentType: "PIX",
                quantityChange: 1,
                totalRevenue: -550,
                totalCost: -300,
                linkedTransactionId: "TX-100",
                notes: "Customer refund",
            }

            // Act
            const created = appendTransaction(db, refundTransaction)

            // Assert
            expect(created.transactionType).toBe("VOID")
            expect(created.paymentType).toBe("PIX")
            expect(created.linkedTransactionId).toBe("TX-100")
        })

        it("GIVEN an existing id WHEN appending a duplicate transaction THEN throws SQLite constraint error", () => {
            // Arrange
            appendTransaction(db, sampleTransaction)

            // Act & Assert
            expect(() => appendTransaction(db, sampleTransaction)).toThrow()
        })
    })
})
