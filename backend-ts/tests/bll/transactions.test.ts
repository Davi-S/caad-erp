/**
 * Unit test suite for Transaction Ledger BLL handlers (`src/bll/transactions.ts`).
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    EmptyBulkOperationError,
    IneligibleCreditSaleError,
    IneligibleVoidTargetError,
    InsufficientStockError,
    ProductInactiveError,
    ProductNotFoundError,
    SalesmanInactiveError,
    SalesmanNotFoundError,
    TransactionNotFoundError,
    addProduct,
    addSalesman,
    calculateInventory,
    getTransaction,
    listTransactions,
    recordBulkSale,
    recordCreditPayment,
    recordRestock,
    recordSale,
    recordVoid,
    recordWriteOff,
} from "../../src/bll/index.js"
import type { DB } from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Transaction Ledger BLL Handlers", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
        // Seed active product and salesman
        addProduct(db, {
            id: "P-001",
            name: "Soda",
            sellPrice: 500,
            isActive: true,
        })
        addSalesman(db, {
            id: "S-001",
            name: "Alice",
            isActive: true,
        })
        // Seed initial stock (10 units via RESTOCK)
        recordRestock(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 10,
            totalCost: 3000,
        })
    })

    it("GIVEN an existing transaction WHEN getTransaction is called THEN returns transaction record", () => {
        // Arrange
        const all = listTransactions(db)
        const firstTx = all[0]

        // Act
        const found = getTransaction(db, firstTx.id)

        // Assert
        expect(found).toEqual(firstTx)
    })

    it("GIVEN a non-existent transaction ID WHEN getTransaction is called THEN throws TransactionNotFoundError", () => {
        // Arrange & Act & Assert
        expect(() => getTransaction(db, "TX-999")).toThrow(TransactionNotFoundError)
    })

    it("GIVEN valid sale command WHEN recordSale is called THEN appends SALE transaction and deducts stock", () => {
        // Arrange
        const initialStock = calculateInventory(db)["P-001"]
        expect(initialStock).toBe(10)

        // Act
        const saleTx = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 3,
            totalRevenue: 1500,
            paymentType: "Cash",
        })

        // Assert
        expect(saleTx.transactionType).toBe("SALE")
        expect(saleTx.quantityChange).toBe(-3)
        expect(saleTx.totalRevenue).toBe(1500)
        expect(calculateInventory(db)["P-001"]).toBe(7)
    })

    it("GIVEN non-existent product WHEN recordSale is called THEN throws ProductNotFoundError", () => {
        // Arrange & Act & Assert
        expect(() =>
            recordSale(db, {
                productId: "P-999",
                salesmanId: "S-001",
                quantity: 1,
                totalRevenue: 500,
                paymentType: "Cash",
            }),
        ).toThrow(ProductNotFoundError)
    })

    it("GIVEN an inactive product WHEN recordSale is called THEN throws ProductInactiveError", () => {
        // Arrange
        addProduct(db, {
            id: "P-INACTIVE",
            name: "Discontinued Item",
            sellPrice: 100,
            isActive: false,
        })

        // Act & Assert
        expect(() =>
            recordSale(db, {
                productId: "P-INACTIVE",
                salesmanId: "S-001",
                quantity: 1,
                totalRevenue: 100,
                paymentType: "Cash",
            }),
        ).toThrow(ProductInactiveError)
    })

    it("GIVEN non-existent salesman WHEN recordSale is called THEN throws SalesmanNotFoundError", () => {
        // Arrange & Act & Assert
        expect(() =>
            recordSale(db, {
                productId: "P-001",
                salesmanId: "S-999",
                quantity: 1,
                totalRevenue: 500,
                paymentType: "Cash",
            }),
        ).toThrow(SalesmanNotFoundError)
    })

    it("GIVEN an inactive salesman WHEN recordSale is called THEN throws SalesmanInactiveError", () => {
        // Arrange
        addSalesman(db, {
            id: "S-INACTIVE",
            name: "Fired Employee",
            isActive: false,
        })

        // Act & Assert
        expect(() =>
            recordSale(db, {
                productId: "P-001",
                salesmanId: "S-INACTIVE",
                quantity: 1,
                totalRevenue: 500,
                paymentType: "Cash",
            }),
        ).toThrow(SalesmanInactiveError)
    })

    it("GIVEN quantity exceeding available stock WHEN recordSale is called THEN throws InsufficientStockError", () => {
        // Arrange & Act & Assert (Available stock is 10)
        expect(() =>
            recordSale(db, {
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 15,
                totalRevenue: 7500,
                paymentType: "Cash",
            }),
        ).toThrow(InsufficientStockError)
    })

    it("GIVEN a valid bulk sale cart WHEN recordBulkSale is called THEN records all sales atomically", () => {
        // Arrange
        addProduct(db, {
            id: "P-002",
            name: "Chips",
            sellPrice: 300,
            isActive: true,
        })
        recordRestock(db, {
            productId: "P-002",
            salesmanId: "S-001",
            quantity: 5,
            totalCost: 1000,
        })

        const cart = [
            {
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 2,
                totalRevenue: 1000,
                paymentType: "PIX" as const,
            },
            {
                productId: "P-002",
                salesmanId: "S-001",
                quantity: 3,
                totalRevenue: 900,
                paymentType: "PIX" as const,
            },
        ]

        // Act
        const recorded = recordBulkSale(db, cart)

        // Assert
        expect(recorded).toHaveLength(2)
        expect(calculateInventory(db)["P-001"]).toBe(8)
        expect(calculateInventory(db)["P-002"]).toBe(2)
    })

    it("GIVEN an empty cart WHEN recordBulkSale is called THEN throws EmptyBulkOperationError", () => {
        // Arrange & Act & Assert
        expect(() => recordBulkSale(db, [])).toThrow(EmptyBulkOperationError)
    })

    it("GIVEN aggregate cart quantity exceeding stock WHEN recordBulkSale is called THEN throws InsufficientStockError", () => {
        // Arrange
        const cart = [
            {
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 6,
                totalRevenue: 3000,
                paymentType: "Cash" as const,
            },
            {
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 5,
                totalRevenue: 2500,
                paymentType: "Cash" as const,
            },
        ]

        // Act & Assert (6 + 5 = 11, stock is 10)
        expect(() => recordBulkSale(db, cart)).toThrow(InsufficientStockError)
    })

    it("GIVEN write-off exceeding stock WHEN recordWriteOff is called THEN throws InsufficientStockError", () => {
        // Arrange & Act & Assert
        expect(() =>
            recordWriteOff(db, {
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 11,
            }),
        ).toThrow(InsufficientStockError)
    })

    it("GIVEN a valid write-off command WHEN recordWriteOff is called THEN deducts inventory", () => {
        // Arrange & Act
        const writeOffTx = recordWriteOff(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
            notes: "Expired items",
        })

        // Assert
        expect(writeOffTx.transactionType).toBe("WRITE_OFF")
        expect(writeOffTx.quantityChange).toBe(-2)
        expect(calculateInventory(db)["P-001"]).toBe(8)
    })

    it("GIVEN an OnCredit sale WHEN recordCreditPayment is called THEN appends CREDIT_PAYMENT linked entry", () => {
        // Arrange
        const creditSale = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
            totalRevenue: 1000,
            paymentType: "OnCredit",
        })

        // Act
        const paymentTx = recordCreditPayment(db, {
            linkedTransactionId: creditSale.id,
            salesmanId: "S-001",
            totalRevenue: 1000,
            paymentType: "Cash",
        })

        // Assert
        expect(paymentTx.transactionType).toBe("CREDIT_PAYMENT")
        expect(paymentTx.linkedTransactionId).toBe(creditSale.id)
        expect(paymentTx.quantityChange).toBe(0)
        expect(paymentTx.totalRevenue).toBe(1000)
    })

    it("GIVEN a Cash sale WHEN recordCreditPayment is called THEN throws IneligibleCreditSaleError", () => {
        // Arrange
        const cashSale = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
            totalRevenue: 1000,
            paymentType: "Cash",
        })

        // Act & Assert
        expect(() =>
            recordCreditPayment(db, {
                linkedTransactionId: cashSale.id,
                salesmanId: "S-001",
                totalRevenue: 1000,
                paymentType: "Cash",
            }),
        ).toThrow(IneligibleCreditSaleError)
    })

    it("GIVEN a target transaction WHEN recordVoid is called THEN creates exact reversing VOID entry", () => {
        // Arrange
        const saleTx = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
            totalRevenue: 1000,
            paymentType: "Cash",
        })

        // Act
        const voidTx = recordVoid(db, {
            linkedTransactionId: saleTx.id,
            notes: "Customer returned item",
        })

        // Assert
        expect(voidTx.transactionType).toBe("VOID")
        expect(voidTx.linkedTransactionId).toBe(saleTx.id)
        expect(voidTx.quantityChange).toBe(-saleTx.quantityChange) // Reverses -2 to +2
        expect(voidTx.totalRevenue).toBe(-saleTx.totalRevenue) // Reverses +1000 to -1000
        expect(calculateInventory(db)["P-001"]).toBe(10) // Restores inventory balance
    })

    it("GIVEN a VOID transaction WHEN recordVoid is called on it THEN throws IneligibleVoidTargetError", () => {
        // Arrange
        const saleTx = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
            totalRevenue: 1000,
            paymentType: "Cash",
        })
        const voidTx = recordVoid(db, {
            linkedTransactionId: saleTx.id,
        })

        // Act & Assert
        expect(() =>
            recordVoid(db, {
                linkedTransactionId: voidTx.id,
            }),
        ).toThrow(IneligibleVoidTargetError)
    })
})
