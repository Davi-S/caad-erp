/**
 * Unit test suite for Excel Exporter (exportWorkbook) and Importer (importWorkbook).
 */

import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { createTestDb } from "../bll/setup.js"
import * as dal from "../../src/dal/index.js"
import { autoFitWorksheetColumns, exportWorkbook } from "../../src/excel/exporter.js"
import { importWorkbook } from "../../src/excel/importer.js"

describe("Excel Exporter (exportWorkbook)", () => {
    it("exports an empty database into a valid .xlsx buffer with all 4 sheets", async () => {
        const db = createTestDb()
        const buffer = await exportWorkbook(db)

        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer.length).toBeGreaterThan(1000)

        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

        const sheetNames = workbook.worksheets.map((w) => w.name)
        expect(sheetNames).toEqual(["Dashboard", "Products", "Salesmen", "TransactionLog"])
    })

    it("formats Dashboard formulas, currency values, and product rows correctly", async () => {
        const db = createTestDb()

        dal.appendProduct(db, {
            id: "P1",
            name: "Cerveja Heineken 600ml",
            sellPrice: 1200,
            isActive: true,
        })
        dal.appendProduct(db, { id: "P2", name: "Batata Frita", sellPrice: 2500, isActive: true })
        dal.appendSalesman(db, { id: "S1", name: "Carlos Vendedor", isActive: true })
        dal.appendSalesman(db, { id: "S2", name: "Vendedor Inativo", isActive: false })

        dal.appendTransaction(db, {
            id: "T1",
            timestampIso: "2026-08-19T10:00:00.000Z",
            transactionType: "SALE",
            productId: "P1",
            salesmanId: "S1",
            paymentType: "PIX",
            quantityChange: -2,
            totalRevenue: 2400,
            totalCost: 0,
            linkedTransactionId: null,
            notes: "Mesa 1",
        })

        const buffer = await exportWorkbook(db)
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

        // Dashboard Sheet Assertions
        const dashSheet = workbook.getWorksheet("Dashboard")
        expect(dashSheet).toBeDefined()
        expect(dashSheet?.getCell("A1").value).toBe("CAAD ERP - PAINEL EXECUTIVO E DE ESTOQUE")

        // Formula assertions
        const revCell = dashSheet?.getCell("B5")
        expect(revCell?.value).toEqual({ formula: "SUM(TransactionLog!H:H)" })

        const profitCell = dashSheet?.getCell("B7")
        expect(profitCell?.value).toEqual({ formula: "B5+B6" })

        // Products Sheet Assertions (cents converted to BRL currency float: 1200 -> 12)
        const prodSheet = workbook.getWorksheet("Products")
        expect(prodSheet?.rowCount).toBe(3) // Header + 2 Products
        expect(prodSheet?.getRow(2).getCell(1).value).toBe("P1")
        expect(prodSheet?.getRow(2).getCell(3).value).toBe(12)

        // Salesmen Sheet Assertions
        const salesmanSheet = workbook.getWorksheet("Salesmen")
        expect(salesmanSheet?.rowCount).toBe(3) // Header + 2 Salesmen
    })

    it("excludes deactivated salespeople from the active sales team section on the Dashboard", async () => {
        const db = createTestDb()

        dal.appendSalesman(db, { id: "S_ACT", name: "Vendedor Ativo", isActive: true })
        dal.appendSalesman(db, { id: "S_INA", name: "Vendedor Inativo", isActive: false })

        const buffer = await exportWorkbook(db)
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

        const dashSheet = workbook.getWorksheet("Dashboard")
        expect(dashSheet).toBeDefined()

        // Active salespeople header row is at row 25
        const activeSalesHeader = dashSheet?.getCell("A25").value
        expect(activeSalesHeader).toBe("Desempenho da Equipe de Vendas (Vendedores Ativos)")

        // Row 27 should reference the active salesman
        const activeRef = dashSheet?.getCell("A27").value as { formula: string }
        expect(activeRef).toBeDefined()
        expect(activeRef.formula).toBe("Salesmen!A2") // Points to S_ACT

        // Row 28 should be empty because S_INA is inactive
        const inactiveRef = dashSheet?.getCell("A28").value
        expect(inactiveRef).toBeNull()
    })
})

describe("Excel Importer (importWorkbook)", () => {
    it("atomically replaces existing database records with imported workbook rows", async () => {
        const sourceDb = createTestDb()

        dal.appendProduct(sourceDb, {
            id: "P_NEW",
            name: "Novo Produto",
            sellPrice: 1800,
            isActive: true,
        })
        dal.appendSalesman(sourceDb, { id: "S_NEW", name: "Novo Vendedor", isActive: true })
        dal.appendTransaction(sourceDb, {
            id: "T_NEW",
            timestampIso: "2026-08-19T12:00:00.000Z",
            transactionType: "SALE",
            productId: "P_NEW",
            salesmanId: "S_NEW",
            paymentType: "Cash",
            quantityChange: -1,
            totalRevenue: 1800,
            totalCost: 0,
            linkedTransactionId: null,
            notes: "Venda nova",
        })

        const buffer = await exportWorkbook(sourceDb)

        // Create target DB containing old data
        const targetDb = createTestDb()
        dal.appendProduct(targetDb, {
            id: "P_OLD",
            name: "Produto Antigo",
            sellPrice: 500,
            isActive: true,
        })
        dal.appendSalesman(targetDb, { id: "S_OLD", name: "Vendedor Antigo", isActive: true })

        const result = await importWorkbook(targetDb, buffer)
        expect(result).toEqual({
            productsCount: 1,
            salesmenCount: 1,
            transactionsCount: 1,
        })

        const targetProducts = dal.listProducts(targetDb)
        expect(targetProducts).toHaveLength(1)
        expect(targetProducts[0].id).toBe("P_NEW")
        expect(targetProducts[0].name).toBe("Novo Produto")
        expect(targetProducts[0].sellPrice).toBe(1800)

        const targetSalesmen = dal.listSalesmen(targetDb)
        expect(targetSalesmen).toHaveLength(1)
        expect(targetSalesmen[0].id).toBe("S_NEW")

        const targetTransactions = dal.listTransactions(targetDb)
        expect(targetTransactions).toHaveLength(1)
        expect(targetTransactions[0].id).toBe("T_NEW")
    })

    it("ignores non-data worksheets like Dashboard during import", async () => {
        const db = createTestDb()
        dal.appendProduct(db, { id: "P1", name: "Item Teste", sellPrice: 300, isActive: true })
        dal.appendSalesman(db, { id: "S1", name: "Vendedor Teste", isActive: true })

        const buffer = await exportWorkbook(db)
        const importDb = createTestDb()

        const count = await importWorkbook(importDb, buffer)
        expect(count.productsCount).toBe(1)
        expect(count.salesmenCount).toBe(1)
        expect(dal.listProducts(importDb)[0].id).toBe("P1")
    })

    it("handles optional missing fields gracefully during import", async () => {
        const sourceDb = createTestDb()
        dal.appendProduct(sourceDb, {
            id: "P1",
            name: "Produto Sem Notas",
            sellPrice: 1000,
            isActive: true,
        })
        dal.appendSalesman(sourceDb, { id: "S1", name: "Vendedor Sem Notas", isActive: true })
        dal.appendTransaction(sourceDb, {
            id: "T1",
            timestampIso: "2026-08-19T14:00:00.000Z",
            transactionType: "RESTOCK",
            productId: "P1",
            salesmanId: "S1",
            paymentType: null,
            quantityChange: 10,
            totalRevenue: 0,
            totalCost: -5000,
            linkedTransactionId: null,
            notes: null,
        })

        const buffer = await exportWorkbook(sourceDb)
        const targetDb = createTestDb()

        const count = await importWorkbook(targetDb, buffer)
        expect(count.transactionsCount).toBe(1)

        const importedTx = dal.listTransactions(targetDb)[0]
        expect(importedTx.id).toBe("T1")
        expect(importedTx.paymentType).toBeNull()
        expect(importedTx.notes).toBeNull()
        expect(importedTx.totalCost).toBe(-5000)
    })

    it("handles formula cell with populated result in exporter column width calculation", async () => {
        const wb = new ExcelJS.Workbook()
        const sheet = wb.addWorksheet("TestSheet")
        sheet.columns = [{ header: "Col1", key: "c1" }]
        sheet.addRow([])
        sheet.getCell("A2").value = { formula: "SUM(B1:B2)", result: "R$ 1.500,00" }

        autoFitWorksheetColumns(sheet)
        expect(sheet.getColumn(1).width).toBeGreaterThan(12)
    })

    it("skips invalid rows and parses boolean/null cell values correctly during import", async () => {
        const wb = new ExcelJS.Workbook()

        // Products sheet with valid row (boolean cell), string "true" cell, boolean false cell, invalid empty row, and row missing name
        const pSheet = wb.addWorksheet("Products")
        pSheet.addRow(["ID", "Name", "Sell Price", "Is Active"])
        pSheet.addRow(["P10", "Prod 10", 10.5, true]) // boolean true cell
        pSheet.addRow(["P11", "Prod 11", 5.0, "true"]) // string "true" cell
        pSheet.addRow(["P12", "Prod 12", 2.0, false]) // boolean false cell
        pSheet.addRow(["", "No ID", 5.0, "true"]) // missing ID -> skipped
        pSheet.addRow(["P13", "", 5.0, "true"]) // missing Name -> skipped

        // Salesmen sheet with valid row, missing ID row, missing Name row
        const sSheet = wb.addWorksheet("Salesmen")
        sSheet.addRow(["ID", "Name", "Is Active"])
        sSheet.addRow(["S10", "Salesman 10", true]) // boolean true cell
        sSheet.addRow(["", "No ID", "true"]) // missing ID -> skipped
        sSheet.addRow(["S11", "", "true"]) // missing Name -> skipped

        // TransactionLog sheet with valid row and incomplete rows
        const tSheet = wb.addWorksheet("TransactionLog")
        tSheet.addRow([
            "ID",
            "Timestamp",
            "Type",
            "Product ID",
            "Salesman ID",
            "Payment Type",
            "Quantity Change",
            "Total Revenue",
            "Total Cost",
            "Linked Tx ID",
            "Notes",
        ])
        tSheet.addRow([
            "T10",
            "2026-08-19T10:00:00.000Z",
            "SALE",
            "P10",
            "S10",
            "Cash",
            -1,
            10.5,
            0,
            null, // null cell value
            undefined, // undefined cell value
        ])
        tSheet.addRow(["T11", "", "SALE", "P10", "S10"]) // missing timestamp -> skipped

        const buffer = (await wb.xlsx.writeBuffer()) as Buffer
        const targetDb = createTestDb()

        const res = await importWorkbook(targetDb, buffer)
        expect(res.productsCount).toBe(3)
        expect(res.salesmenCount).toBe(1)
        expect(res.transactionsCount).toBe(1)

        const prods = dal.listProducts(targetDb)
        expect(prods.find((p) => p.id === "P10")?.isActive).toBe(true)
        expect(prods.find((p) => p.id === "P11")?.isActive).toBe(true)
        expect(prods.find((p) => p.id === "P12")?.isActive).toBe(false)
    })
})
