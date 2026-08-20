/**
 * Integration test suite for tRPC Routers and Error Status Code Translation (`src/trpc/routers/`).
 */

import { TRPCError } from "@trpc/server"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestCaller } from "./setup.js"

describe("tRPC Service Layer Integration Suite", () => {
    let caller: ReturnType<typeof createTestCaller>["caller"]

    beforeEach(() => {
        const testSetup = createTestCaller()
        caller = testSetup.caller
    })

    describe("Products Router Procedures", () => {
        it("GIVEN fresh database WHEN products.list is called THEN returns empty array", async () => {
            // Arrange & Act
            const result = await caller.products.list()

            // Assert
            expect(result).toHaveLength(0)
        })

        it("GIVEN valid add payload WHEN products.add is called THEN registers new product", async () => {
            // Arrange & Act
            const product = await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })

            // Assert
            expect(product.id).toBe("P-001")
            expect(product.name).toBe("Soda")

            const list = await caller.products.list()
            expect(list).toHaveLength(1)
        })

        it("GIVEN registered product WHEN products.get is called THEN returns matching product record", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })

            // Act
            const product = await caller.products.get({ id: "P-001" })

            // Assert
            expect(product.name).toBe("Soda")
        })

        it("GIVEN non-existent product ID WHEN products.get is called THEN throws TRPCError NOT_FOUND", async () => {
            // Arrange, Act & Assert
            try {
                await caller.products.get({ id: "P-999" })
                expect.unreachable("Should have thrown TRPCError")
            } catch (err) {
                expect(err).toBeInstanceOf(TRPCError)
                expect((err as TRPCError).code).toBe("NOT_FOUND")
            }
        })

        it("GIVEN duplicate product ID WHEN products.add is called THEN throws TRPCError CONFLICT", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })

            // Act & Assert
            try {
                await caller.products.add({
                    id: "P-001",
                    name: "Duplicate Soda",
                    sellPrice: 600,
                    isActive: true,
                })
                expect.unreachable("Should have thrown TRPCError")
            } catch (err) {
                expect(err).toBeInstanceOf(TRPCError)
                expect((err as TRPCError).code).toBe("CONFLICT")
            }
        })

        it("GIVEN valid update payload WHEN products.update is called THEN modifies product fields", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })

            // Act
            const updated = await caller.products.update({
                id: "P-001",
                data: { sellPrice: 600 },
            })

            // Assert
            expect(updated.sellPrice).toBe(600)
        })
    })

    describe("Salesmen Router Procedures", () => {
        it("GIVEN fresh database WHEN salesmen.list is called THEN returns empty array", async () => {
            // Arrange & Act
            const list = await caller.salesmen.list()

            // Assert
            expect(list).toHaveLength(0)
        })

        it("GIVEN valid add payload WHEN salesmen.add is called THEN registers new salesman", async () => {
            // Arrange & Act
            const salesman = await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })

            // Assert
            expect(salesman.id).toBe("S-001")
            expect(salesman.name).toBe("Alice")
        })

        it("GIVEN non-existent salesman ID WHEN salesmen.get is called THEN throws TRPCError NOT_FOUND", async () => {
            // Arrange, Act & Assert
            try {
                await caller.salesmen.get({ id: "S-999" })
                expect.unreachable("Should have thrown TRPCError")
            } catch (err) {
                expect(err).toBeInstanceOf(TRPCError)
                expect((err as TRPCError).code).toBe("NOT_FOUND")
            }
        })

        it("GIVEN duplicate salesman ID WHEN salesmen.add is called THEN throws TRPCError CONFLICT", async () => {
            // Arrange
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })

            // Act & Assert
            try {
                await caller.salesmen.add({
                    id: "S-001",
                    name: "Duplicate Alice",
                    isActive: true,
                })
                expect.unreachable("Should have thrown TRPCError")
            } catch (err) {
                expect(err).toBeInstanceOf(TRPCError)
                expect((err as TRPCError).code).toBe("CONFLICT")
            }
        })

        it("GIVEN valid update payload WHEN salesmen.update is called THEN modifies salesman fields", async () => {
            // Arrange
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })

            // Act
            const updated = await caller.salesmen.update({
                id: "S-001",
                data: { name: "Alice Cooper" },
            })

            // Assert
            expect(updated.name).toBe("Alice Cooper")
        })
    })

    describe("Transactions Router Procedures", () => {
        it("GIVEN valid restock and sale workflow WHEN procedures are called THEN processes transaction and updates stock", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })

            // Act: Restock 10 units
            await caller.transactions.recordRestock({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 10,
                totalCost: 3000,
            })

            // Act: Sell 3 units
            const sale = await caller.transactions.recordSale({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 3,
                totalRevenue: 1500,
                paymentType: "Cash",
            })

            // Assert
            expect(sale.transactionType).toBe("SALE")
            const inventory = await caller.reports.inventory()
            expect(inventory["P-001"]).toBe(7) // 10 - 3 = 7
        })

        it("GIVEN sale quantity exceeding stock WHEN transactions.recordSale is called THEN throws TRPCError BAD_REQUEST", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })

            // Act & Assert
            try {
                await caller.transactions.recordSale({
                    productId: "P-001",
                    salesmanId: "S-001",
                    quantity: 50,
                    totalRevenue: 25000,
                    paymentType: "Cash",
                })
                expect.unreachable("Should have thrown TRPCError")
            } catch (err) {
                expect(err).toBeInstanceOf(TRPCError)
                expect((err as TRPCError).code).toBe("BAD_REQUEST")
            }
        })

        it("GIVEN valid cart array WHEN transactions.recordBulkSale is called THEN processes all sales atomically", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })
            await caller.transactions.recordRestock({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 20,
                totalCost: 6000,
            })

            // Act
            const recordedSales = await caller.transactions.recordBulkSale([
                {
                    productId: "P-001",
                    salesmanId: "S-001",
                    quantity: 2,
                    totalRevenue: 1000,
                    paymentType: "Cash",
                },
                {
                    productId: "P-001",
                    salesmanId: "S-001",
                    quantity: 3,
                    totalRevenue: 1500,
                    paymentType: "Cash",
                },
            ])

            // Assert
            expect(recordedSales).toHaveLength(2)
            const inventory = await caller.reports.inventory()
            expect(inventory["P-001"]).toBe(15) // 20 - 2 - 3 = 15
        })

        it("GIVEN an OnCredit sale WHEN transactions.recordCreditPayment is called THEN appends linked payment", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })
            await caller.transactions.recordRestock({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 10,
                totalCost: 3000,
            })
            const creditSale = await caller.transactions.recordSale({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 2,
                totalRevenue: 0,
                paymentType: "OnCredit",
            })

            // Act
            const payment = await caller.transactions.recordCreditPayment({
                linkedTransactionId: creditSale.id,
                salesmanId: "S-001",
                totalRevenue: 500,
                paymentType: "Cash",
            })

            // Assert
            expect(payment.transactionType).toBe("CREDIT_PAYMENT")
            expect(payment.linkedTransactionId).toBe(creditSale.id)
        })

        it("GIVEN a recorded transaction WHEN transactions.recordVoid is called THEN creates reversing entry", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })
            const restock = await caller.transactions.recordRestock({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 10,
                totalCost: 3000,
            })

            // Act
            const voidTx = await caller.transactions.recordVoid({
                linkedTransactionId: restock.id,
            })

            // Assert
            expect(voidTx.transactionType).toBe("VOID")
            const inventory = await caller.reports.inventory()
            expect(inventory["P-001"]).toBe(0) // Restock of 10 voided -> 0
        })
    })

    describe("Reports Router Procedures", () => {
        it("GIVEN restock and sale transactions WHEN reports.inventory is called THEN returns accurate stock map", async () => {
            // Arrange
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })
            await caller.transactions.recordRestock({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 10,
                totalCost: 3000,
            })
            await caller.transactions.recordSale({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 4,
                totalRevenue: 2000,
                paymentType: "Cash",
            })

            // Act
            const inventory = await caller.reports.inventory()

            // Assert
            expect(inventory["P-001"]).toBe(6)
        })

        it("GIVEN active database WHEN reports.exportWorkbook and importWorkbook are called THEN exports and imports base64 workbook", async () => {
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })

            const exported = await caller.reports.exportWorkbook()
            expect(exported.filename).toBe("master_workbook.xlsx")
            expect(typeof exported.base64).toBe("string")

            // Test plain base64 import
            const res1 = await caller.reports.importWorkbook({ base64: exported.base64 })
            expect(res1.success).toBe(true)
            expect(res1.count.productsCount).toBe(1)

            // Test data URL prefix base64 import
            const res2 = await caller.reports.importWorkbook({
                base64: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${exported.base64}`,
            })
            expect(res2.success).toBe(true)
            expect(res2.count.productsCount).toBe(1)
        })
    })

    describe("Transactions Router Additional Procedures", () => {
        it("GIVEN recorded transactions WHEN list, get, and recordWriteOff are called THEN processes as expected", async () => {
            await caller.products.add({
                id: "P-001",
                name: "Soda",
                sellPrice: 500,
                isActive: true,
            })
            await caller.salesmen.add({
                id: "S-001",
                name: "Alice",
                isActive: true,
            })
            const restock = await caller.transactions.recordRestock({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 10,
                totalCost: 3000,
            })

            const writeOff = await caller.transactions.recordWriteOff({
                productId: "P-001",
                salesmanId: "S-001",
                quantity: 2,
            })
            expect(writeOff.transactionType).toBe("WRITE_OFF")

            const list = await caller.transactions.list()
            expect(list.length).toBeGreaterThanOrEqual(2)

            const single = await caller.transactions.get({ id: restock.id })
            expect(single.id).toBe(restock.id)

            await expect(caller.transactions.get({ id: "TX-NON-EXISTENT" })).rejects.toThrow(
                TRPCError,
            )
        })

        it("GIVEN invalid procedure input WHEN procedure is called THEN domainErrorTranslator executes cause fallback", async () => {
            await expect(
                caller.products.add({ id: "", name: "Invalid", sellPrice: 10, isActive: true }),
            ).rejects.toThrow(TRPCError)
        })
    })
})
