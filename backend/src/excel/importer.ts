/**
 * Streamlined Excel workbook importer.
 *
 * Deserializes worksheets matching the standard exported schema (`Products`, `Salesmen`,
 * `TransactionLog`) and replaces database records inside an atomic SQLite transaction.
 */

import ExcelJS from "exceljs"
import type { DB, PaymentType, TransactionType } from "../dal/index.js"
import { products, salesmen, transactions } from "../dal/index.js"

export interface ImportResult {
    productsCount: number
    salesmenCount: number
    transactionsCount: number
}

/** Returns the string representation of an Excel cell value. */
const cellStr = (cell: ExcelJS.Cell): string =>
    cell.value === null || cell.value === undefined ? "" : String(cell.value).trim()

/** Converts a decimal BRL currency cell value (e.g. 2.5) to integer cents (250). */
const cellCents = (cell: ExcelJS.Cell): number => Math.round(Number(cellStr(cell)) * 100)

/** Converts a boolean or boolean string cell value ("true"/"false") to boolean. */
const cellBool = (cell: ExcelJS.Cell): boolean =>
    cell.value === true || cellStr(cell).toLowerCase() === "true"

/**
 * Parses an Excel workbook Buffer and replaces current database records.
 *
 * @param db - Active database client instance.
 * @param buffer - Binary .xlsx file Buffer.
 * @returns Summary count of imported records.
 */
export async function importWorkbook(db: DB, buffer: Buffer): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

    // Products sheet
    const parsedProducts: Array<typeof products.$inferInsert> = []
    const prodSheet = workbook.getWorksheet("Products")
    prodSheet?.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const id = cellStr(row.getCell(1))
        const name = cellStr(row.getCell(2))
        if (!id || !name) return

        parsedProducts.push({
            id,
            name,
            sellPrice: cellCents(row.getCell(3)),
            isActive: cellBool(row.getCell(4)),
        })
    })

    // Salesmen sheet
    const parsedSalesmen: Array<typeof salesmen.$inferInsert> = []
    const salesmanSheet = workbook.getWorksheet("Salesmen")
    salesmanSheet?.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const id = cellStr(row.getCell(1))
        const name = cellStr(row.getCell(2))
        if (!id || !name) return

        parsedSalesmen.push({
            id,
            name,
            isActive: cellBool(row.getCell(3)),
        })
    })

    // TransactionLog sheet
    const parsedTransactions: Array<typeof transactions.$inferInsert> = []
    const txSheet = workbook.getWorksheet("TransactionLog")
    txSheet?.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const id = cellStr(row.getCell(1))
        const timestampIso = cellStr(row.getCell(2))
        const typeStr = cellStr(row.getCell(3)) as TransactionType
        const productId = cellStr(row.getCell(4))
        const salesmanId = cellStr(row.getCell(5))
        if (!id || !timestampIso || !typeStr || !productId || !salesmanId) return

        const payType = cellStr(row.getCell(6))

        parsedTransactions.push({
            id,
            timestampIso,
            transactionType: typeStr,
            productId,
            salesmanId,
            paymentType: (payType as PaymentType) || null,
            quantityChange: Number(cellStr(row.getCell(7))),
            totalRevenue: cellCents(row.getCell(8)),
            totalCost: cellCents(row.getCell(9)),
            linkedTransactionId: cellStr(row.getCell(10)) || null,
            notes: cellStr(row.getCell(11)) || null,
        })
    })

    // Replace database records atomically
    db.transaction((tx) => {
        tx.delete(transactions).run()
        tx.delete(products).run()
        tx.delete(salesmen).run()

        for (const p of parsedProducts) tx.insert(products).values(p).run()
        for (const s of parsedSalesmen) tx.insert(salesmen).values(s).run()
        for (const t of parsedTransactions) tx.insert(transactions).values(t).run()
    })

    return {
        productsCount: parsedProducts.length,
        salesmenCount: parsedSalesmen.length,
        transactionsCount: parsedTransactions.length,
    }
}
