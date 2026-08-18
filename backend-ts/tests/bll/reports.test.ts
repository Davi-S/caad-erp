/**
 * Unit test suite for Reporting Analytics BLL handlers (`src/bll/reports.ts`).
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    addProduct,
    addSalesman,
    calculateInventory,
    calculateNetProfit,
    calculateOutstandingDebts,
    calculateTotalCost,
    calculateTotalRevenue,
    recordCreditPayment,
    recordRestock,
    recordSale,
    recordVoid,
    recordWriteOff,
} from "../../src/bll/index.js"
import type { DB } from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Reporting Analytics BLL Handlers", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
        // Seed active products and salesman
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
            isActive: true,
        })
        addSalesman(db, {
            salesmanId: "S-001",
            salesmanName: "Alice",
            isActive: true,
        })
    })

    it("GIVEN multiple transactions WHEN calculateInventory is called THEN returns accurate on-hand stock per product", () => {
        // Arrange
        recordRestock(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 20,
            totalCost: 6000,
        })
        recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 5,
            totalRevenue: 2500,
            paymentType: "Cash",
        })
        recordWriteOff(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
        })

        // Act
        const inventory = calculateInventory(db)

        // Assert
        expect(inventory["P-001"]).toBe(13) // 20 - 5 - 2 = 13
        expect(inventory["P-002"]).toBe(0) // Unused product defaults to 0
    })

    it("GIVEN revenue and cost transactions WHEN profit calculation helpers are called THEN returns exact totals and net profit", () => {
        // Arrange
        recordRestock(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 10,
            totalCost: 3000, // -3000
        })
        recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 4,
            totalRevenue: 2000, // +2000
            paymentType: "Cash",
        })

        // Act
        const totalRevenue = calculateTotalRevenue(db)
        const totalCost = calculateTotalCost(db)
        const netProfit = calculateNetProfit(db)

        // Assert
        expect(totalRevenue).toBe(2000)
        expect(totalCost).toBe(-3000)
        expect(netProfit).toBe(-1000) // 2000 + (-3000) = -1000
    })

    it("GIVEN credit sales and payments WHEN calculateOutstandingDebts is called THEN calculates unpaid balances", () => {
        // Arrange
        recordRestock(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 10,
            totalCost: 3000,
        })
        const creditSale = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
            totalRevenue: 1000,
            paymentType: "OnCredit",
        })
        recordCreditPayment(db, {
            linkedTransactionId: creditSale.transactionId,
            salesmanId: "S-001",
            totalRevenue: 400,
            paymentType: "Cash",
        })

        // Act
        const report = calculateOutstandingDebts(db)

        // Assert
        expect(report.balances).toHaveLength(1)
        expect(report.balances[0].transactionId).toBe(creditSale.transactionId)
        expect(report.balances[0].expectedAmount).toBe(1000)
        expect(report.balances[0].amountPaid).toBe(400)
        expect(report.balances[0].balance).toBe(600) // 1000 - 400 = 600
        expect(report.totalOutstanding).toBe(600)
    })

    it("GIVEN voided credit sale WHEN calculateOutstandingDebts is called THEN ignores voided sale", () => {
        // Arrange
        recordRestock(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 10,
            totalCost: 3000,
        })
        const creditSale = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 2,
            totalRevenue: 1000,
            paymentType: "OnCredit",
        })
        recordVoid(db, {
            linkedTransactionId: creditSale.transactionId,
        })

        // Act
        const report = calculateOutstandingDebts(db)

        // Assert
        expect(report.balances).toHaveLength(0)
        expect(report.totalOutstanding).toBe(0)
    })
})
