/**
 * Unit test suite for Reporting Analytics BLL handlers (`src/bll/reports.ts`).
 */

import { beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
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
import * as dal from "../../src/dal/index.js"
import { createTestDb } from "./setup.js"

describe("Reporting Analytics BLL Handlers", () => {
    let db: DB

    beforeEach(() => {
        db = createTestDb()
        // Seed active products and salesman
        addProduct(db, {
            id: "P-001",
            name: "Soda",
            sellPrice: 500,
            isActive: true,
        })
        addProduct(db, {
            id: "P-002",
            name: "Chips",
            sellPrice: 300,
            isActive: true,
        })
        addSalesman(db, {
            id: "S-001",
            name: "Alice",
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
            totalRevenue: 0,
            paymentType: "OnCredit",
        })
        recordCreditPayment(db, {
            linkedTransactionId: creditSale.id,
            salesmanId: "S-001",
            totalRevenue: 400,
            paymentType: "Cash",
        })

        // Act
        const report = calculateOutstandingDebts(db)

        // Assert
        expect(report.balances).toHaveLength(1)
        expect(report.balances[0].transactionId).toBe(creditSale.id)
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
            totalRevenue: 0,
            paymentType: "OnCredit",
        })
        recordVoid(db, {
            linkedTransactionId: creditSale.id,
        })

        // Act
        const report = calculateOutstandingDebts(db)

        // Assert
        expect(report.balances).toHaveLength(0)
        expect(report.totalOutstanding).toBe(0)
    })

    it("GIVEN credit sale of product with zero sell price WHEN calculateOutstandingDebts is called THEN ignores zero expectedAmount sale", () => {
        addProduct(db, {
            id: "P-FREE",
            name: "Free Sample",
            sellPrice: 0,
            isActive: true,
        })
        recordRestock(db, {
            productId: "P-FREE",
            salesmanId: "S-001",
            quantity: 10,
            totalCost: 0,
        })
        const creditSale = recordSale(db, {
            productId: "P-FREE",
            salesmanId: "S-001",
            quantity: 5,
            totalRevenue: 0,
            paymentType: "OnCredit",
        })


        const report = calculateOutstandingDebts(db)
        expect(report.balances.find((b) => b.transactionId === creditSale.id)).toBeUndefined()
    })

    it("GIVEN fully paid credit sale WHEN calculateOutstandingDebts is called THEN excludes sale with balance <= 0", () => {
        recordRestock(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 10,
            totalCost: 3000,
        })
        const creditSale = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 1,
            totalRevenue: 0,
            paymentType: "OnCredit",
        })
        recordCreditPayment(db, {
            linkedTransactionId: creditSale.id,
            salesmanId: "S-001",
            totalRevenue: 500, // Fully pays expectedAmount of 500
            paymentType: "Cash",
        })

        const report = calculateOutstandingDebts(db)
        expect(report.balances.find((b) => b.transactionId === creditSale.id)).toBeUndefined()
    })

    it("GIVEN cash sale transaction WHEN calculateOutstandingDebts is called THEN ignores non-credit sales", () => {
        recordRestock(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 5,
            totalCost: 1500,
        })
        const cashSale = recordSale(db, {
            productId: "P-001",
            salesmanId: "S-001",
            quantity: 1,
            totalRevenue: 500,
            paymentType: "Cash",
        })

        const report = calculateOutstandingDebts(db)
        expect(report.balances.find((b) => b.transactionId === cashSale.id)).toBeUndefined()
    })

    it("GIVEN credit sale referencing missing product WHEN calculateOutstandingDebts is called THEN handles product lookup exception gracefully", () => {
        db.run(sql`PRAGMA foreign_keys = OFF`)
        dal.appendTransaction(db, {
            id: "T-ORPHAN",
            timestampIso: new Date().toISOString(),
            transactionType: "SALE",
            productId: "P-NONEXISTENT",
            salesmanId: "S-001",
            paymentType: "OnCredit",
            quantityChange: -1,
            totalRevenue: 0,
            totalCost: 0,
            linkedTransactionId: null,
            notes: null,
        })
        db.run(sql`PRAGMA foreign_keys = ON`)

        const report = calculateOutstandingDebts(db)
        expect(report.balances.find((b) => b.transactionId === "T-ORPHAN")).toBeUndefined()
    })
})


