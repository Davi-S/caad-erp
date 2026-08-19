/**
 * Excel workbook generator exporting SQLite database tables to an .xlsx buffer.
 */

import ExcelJS from "exceljs"
import type { DB } from "../dal/index.js"
import * as dal from "../dal/index.js"

/**
 * Queries SQLite database tables and builds a formatted multi-sheet Excel workbook Buffer.
 *
 * @param db - Active database client instance.
 * @returns Promise resolving to the binary .xlsx Buffer.
 */
export async function exportWorkbook(db: DB): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "CAAD ERP"
    workbook.created = new Date()

    // Sheet Products
    const prodSheet = workbook.addWorksheet("Products")
    prodSheet.columns = [
        { header: "ProductID", key: "id", width: 20 },
        { header: "ProductName", key: "name", width: 30 },
        { header: "SellPrice", key: "sellPrice", width: 14 },
        { header: "IsActive", key: "isActive", width: 12 },
    ]

    const products = dal.listProducts(db)
    for (const p of products) {
        prodSheet.addRow({
            id: p.id,
            name: p.name,
            sellPrice: p.sellPrice / 100,
            isActive: Boolean(p.isActive),
        })
    }

    // Sheet Salesmen
    const salesmanSheet = workbook.addWorksheet("Salesmen")
    salesmanSheet.columns = [
        { header: "SalesmanID", key: "id", width: 20 },
        { header: "SalesmanName", key: "name", width: 30 },
        { header: "IsActive", key: "isActive", width: 12 },
    ]

    const salesmen = dal.listSalesmen(db)
    for (const s of salesmen) {
        salesmanSheet.addRow({
            id: s.id,
            name: s.name,
            isActive: Boolean(s.isActive),
        })
    }

    // Sheet TransactionLog
    const txSheet = workbook.addWorksheet("TransactionLog")
    txSheet.columns = [
        { header: "TransactionID", key: "id", width: 38 },
        { header: "TimestampISO", key: "timestampIso", width: 26 },
        { header: "TransactionType", key: "transactionType", width: 18 },
        { header: "ProductID", key: "productId", width: 20 },
        { header: "SalesmanID", key: "salesmanId", width: 20 },
        { header: "PaymentType", key: "paymentType", width: 14 },
        { header: "QuantityChange", key: "quantityChange", width: 16 },
        { header: "TotalRevenue", key: "totalRevenue", width: 16 },
        { header: "TotalCost", key: "totalCost", width: 16 },
        { header: "LinkedTransactionID", key: "linkedTransactionId", width: 38 },
        { header: "Notes", key: "notes", width: 35 },
    ]

    const transactions = dal.listTransactions(db)
    for (const t of transactions) {
        txSheet.addRow({
            id: t.id,
            timestampIso: t.timestampIso,
            transactionType: t.transactionType,
            productId: t.productId,
            salesmanId: t.salesmanId,
            paymentType: t.paymentType ?? "",
            quantityChange: t.quantityChange,
            totalRevenue: t.totalRevenue / 100,
            totalCost: t.totalCost / 100,
            linkedTransactionId: t.linkedTransactionId ?? "",
            notes: t.notes ?? "",
        })
    }

    // Apply header row styling across all worksheets
    for (const sheet of [prodSheet, salesmanSheet, txSheet]) {
        const headerRow = sheet.getRow(1)
        headerRow.font = { bold: true }
        headerRow.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F4F6" },
        }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
}
