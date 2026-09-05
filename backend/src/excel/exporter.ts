/**
 * Excel workbook generator exporting SQLite database tables and a dynamic Dashboard sheet
 * to an .xlsx buffer.
 *
 * Worksheets included:
 *   - Sheet 1: Dashboard (dynamic formulas for KPIs, payment breakdown, inventory, and sales performance)
 *   - Sheet 2: Products
 *   - Sheet 3: Salesmen
 *   - Sheet 4: TransactionLog
 */

import ExcelJS from "exceljs"
import type { DB } from "../dal/index.js"
import * as dal from "../dal/index.js"

const BRL_CURRENCY_FORMAT = '"R$" #,##0.00'
const INTEGER_FORMAT = "#,##0"

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

    const products = dal.listProducts(db)
    const salesmen = dal.listSalesmen(db)
    const transactions = dal.listTransactions(db)

    // Dashboard
    const dashSheet = workbook.addWorksheet("Dashboard")

    // Title Banner
    dashSheet.mergeCells("A1:H1")
    const titleCell = dashSheet.getCell("A1")
    titleCell.value = "CAAD ERP - PAINEL EXECUTIVO"
    titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }
    titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" },
    }
    titleCell.alignment = { vertical: "middle", horizontal: "center" }
    dashSheet.getRow(1).height = 36

    // Financial and general KPIs
    dashSheet.mergeCells("A3:B3")
    const sec1Header = dashSheet.getCell("A3")
    sec1Header.value = "Indicadores Financeiros Gerais"
    sec1Header.font = { bold: true, size: 11 }
    sec1Header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }

    const kpiHeaders = dashSheet.getRow(4)
    kpiHeaders.values = ["Métrica / Indicador", "Valor Calculado"]
    kpiHeaders.font = { bold: true }
    kpiHeaders.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }

    // KPI Rows (Rows 5 to 12)
    const prodEndRow = 22 + products.length
    const kpiDefs = [
        {
            label: "Receita Bruta Realizada",
            formula: "SUM(TransactionLog!H:H)",
            isCurrency: true,
        },
        {
            label: "Custos de Estoque Realizados",
            formula: "SUM(TransactionLog!I:I)",
            isCurrency: true,
        },
        {
            label: "Lucro Líquido Realizado",
            formula: "B5+B6",
            isCurrency: true,
        },
        {
            label: "Receita Potencial Futura (Estoque)",
            formula: products.length > 0 ? `SUM(H23:H${prodEndRow})` : "0",
            isCurrency: true,
        },
        {
            label: "Lucro Projetado Total",
            formula: "B7+B8",
            isCurrency: true,
        },
        {
            label: "Vendas Realizadas",
            formula: 'COUNTIF(TransactionLog!C:C, "SALE")',
            isCurrency: false,
        },
        {
            label: "Reposições de Estoque",
            formula: 'COUNTIF(TransactionLog!C:C, "RESTOCK")',
            isCurrency: false,
        },
        {
            label: "Baixas / Perdas",
            formula: 'COUNTIF(TransactionLog!C:C, "WRITE_OFF")',
            isCurrency: false,
        },
    ]

    kpiDefs.forEach((kpi, idx) => {
        const rowNum = 5 + idx
        const r = dashSheet.getRow(rowNum)
        r.getCell(1).value = kpi.label
        const valCell = r.getCell(2)
        valCell.value = { formula: kpi.formula }
        valCell.numFmt = kpi.isCurrency ? BRL_CURRENCY_FORMAT : INTEGER_FORMAT
        valCell.font = { bold: idx === 2 || idx === 4 }
    })

    // Resumo por forma de pagamento
    dashSheet.mergeCells("A14:C14")
    const sec2Header = dashSheet.getCell("A14")
    sec2Header.value = "Resumo por Forma de Pagamento"
    sec2Header.font = { bold: true, size: 11 }
    sec2Header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }

    const payHeaders = dashSheet.getRow(15)
    payHeaders.values = [
        "Forma de Pagamento",
        "Receita Realizada / Recebida",
        "Quantidade de Operações",
    ]
    payHeaders.font = { bold: true }
    payHeaders.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }

    const payDefs = [
        {
            label: "Dinheiro (Cash)",
            revFormula: 'SUMIFS(TransactionLog!H:H, TransactionLog!F:F, "Cash")',
            cntFormula: 'COUNTIFS(TransactionLog!F:F, "Cash", TransactionLog!C:C, "SALE")',
        },
        {
            label: "PIX",
            revFormula: 'SUMIFS(TransactionLog!H:H, TransactionLog!F:F, "PIX")',
            cntFormula: 'COUNTIFS(TransactionLog!F:F, "PIX", TransactionLog!C:C, "SALE")',
        },
        {
            label: "Fiado / Crédito (OnCredit)",
            revFormula: 'SUMIFS(TransactionLog!H:H, TransactionLog!C:C, "CREDIT_PAYMENT")',
            cntFormula: 'COUNTIFS(TransactionLog!F:F, "OnCredit", TransactionLog!C:C, "SALE")',
        },
        {
            label: "Outros (Other)",
            revFormula: 'SUMIFS(TransactionLog!H:H, TransactionLog!F:F, "Other")',
            cntFormula: 'COUNTIFS(TransactionLog!F:F, "Other", TransactionLog!C:C, "SALE")',
        },
    ]

    payDefs.forEach((pay, idx) => {
        const r = dashSheet.getRow(16 + idx)
        r.getCell(1).value = pay.label
        const revCell = r.getCell(2)
        revCell.value = { formula: pay.revFormula }
        revCell.numFmt = BRL_CURRENCY_FORMAT
        const cntCell = r.getCell(3)
        cntCell.value = { formula: pay.cntFormula }
        cntCell.numFmt = INTEGER_FORMAT
    })

    // Visão geral de produtos e estoque
    dashSheet.mergeCells("A21:H21")
    const sec3Header = dashSheet.getCell("A21")
    sec3Header.value = "Visão Geral de Produtos e Estoque"
    sec3Header.font = { bold: true, size: 11 }
    sec3Header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }

    const prodHeaders = dashSheet.getRow(22)
    prodHeaders.values = [
        "ID do Produto",
        "Nome do Produto",
        "Preço Unitário",
        "Estoque Atual",
        "Unidades Vendidas",
        "Unidades Repostas",
        "Receita Realizada",
        "Receita Potencial Futura",
    ]
    prodHeaders.font = { bold: true }
    prodHeaders.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }

    products.forEach((_, idx) => {
        const rNum = 23 + idx
        const pSheetRow = 2 + idx
        const r = dashSheet.getRow(rNum)

        r.getCell(1).value = { formula: `Products!A${pSheetRow}` }
        r.getCell(2).value = { formula: `Products!B${pSheetRow}` }
        const priceCell = r.getCell(3)
        priceCell.value = { formula: `Products!C${pSheetRow}` }
        priceCell.numFmt = BRL_CURRENCY_FORMAT

        const stockCell = r.getCell(4)
        stockCell.value = { formula: `SUMIF(TransactionLog!D:D, A${rNum}, TransactionLog!G:G)` }
        stockCell.numFmt = INTEGER_FORMAT

        const soldCell = r.getCell(5)
        soldCell.value = {
            formula: `SUMIFS(TransactionLog!G:G, TransactionLog!D:D, A${rNum}, TransactionLog!C:C, "SALE")*-1`,
        }
        soldCell.numFmt = INTEGER_FORMAT

        const restockedCell = r.getCell(6)
        restockedCell.value = {
            formula: `SUMIFS(TransactionLog!G:G, TransactionLog!D:D, A${rNum}, TransactionLog!C:C, "RESTOCK")`,
        }
        restockedCell.numFmt = INTEGER_FORMAT

        const revCell = r.getCell(7)
        revCell.value = { formula: `SUMIF(TransactionLog!D:D, A${rNum}, TransactionLog!H:H)` }
        revCell.numFmt = BRL_CURRENCY_FORMAT

        const potCell = r.getCell(8)
        potCell.value = { formula: `D${rNum}*C${rNum}` }
        potCell.numFmt = BRL_CURRENCY_FORMAT
    })

    // Active Salespeople performance
    const activeSalesmen = salesmen.filter((s) => Boolean(s.isActive))
    const salesStartHeaderRow = 22 + products.length + 3
    const salesHeaderRow = salesStartHeaderRow + 1
    const salesDataStartRow = salesHeaderRow + 1

    dashSheet.mergeCells(`A${salesStartHeaderRow}:E${salesStartHeaderRow}`)
    const sec4Header = dashSheet.getCell(`A${salesStartHeaderRow}`)
    sec4Header.value = "Desempenho da Equipe de Vendas (Vendedores Ativos)"
    sec4Header.font = { bold: true, size: 11 }
    sec4Header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }

    const salesmanHeaders = dashSheet.getRow(salesHeaderRow)
    salesmanHeaders.values = [
        "ID do Vendedor",
        "Nome do Vendedor",
        "Vendas Realizadas",
        "Receita Gerada",
        "Ticket Médio",
    ]
    salesmanHeaders.font = { bold: true }
    salesmanHeaders.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }

    activeSalesmen.forEach((s, idx) => {
        const rNum = salesDataStartRow + idx
        const fullIdx = salesmen.findIndex((item) => item.id === s.id)
        const sSheetRow = 2 + fullIdx
        const r = dashSheet.getRow(rNum)

        r.getCell(1).value = { formula: `Salesmen!A${sSheetRow}` }
        r.getCell(2).value = { formula: `Salesmen!B${sSheetRow}` }

        const cntCell = r.getCell(3)
        cntCell.value = {
            formula: `COUNTIFS(TransactionLog!E:E, A${rNum}, TransactionLog!C:C, "SALE")`,
        }
        cntCell.numFmt = INTEGER_FORMAT

        const revCell = r.getCell(4)
        revCell.value = { formula: `SUMIF(TransactionLog!E:E, A${rNum}, TransactionLog!H:H)` }
        revCell.numFmt = BRL_CURRENCY_FORMAT

        const ticketCell = r.getCell(5)
        ticketCell.value = { formula: `IF(C${rNum}>0, D${rNum}/C${rNum}, 0)` }
        ticketCell.numFmt = BRL_CURRENCY_FORMAT
    })

    // Products
    const prodSheet = workbook.addWorksheet("Products")
    prodSheet.columns = [
        { header: "ProductID", key: "id" },
        { header: "ProductName", key: "name" },
        { header: "SellPrice", key: "sellPrice" },
        { header: "IsActive", key: "isActive" },
    ]

    for (const p of products) {
        prodSheet.addRow({
            id: p.id,
            name: p.name,
            sellPrice: p.sellPrice / 100,
            isActive: Boolean(p.isActive),
        })
    }

    // Salesmen
    const salesmanSheet = workbook.addWorksheet("Salesmen")
    salesmanSheet.columns = [
        { header: "SalesmanID", key: "id" },
        { header: "SalesmanName", key: "name" },
        { header: "IsActive", key: "isActive" },
    ]

    for (const s of salesmen) {
        salesmanSheet.addRow({
            id: s.id,
            name: s.name,
            isActive: Boolean(s.isActive),
        })
    }

    // TransactionLog
    const txSheet = workbook.addWorksheet("TransactionLog")
    txSheet.columns = [
        { header: "TransactionID", key: "id" },
        { header: "TimestampISO", key: "timestampIso" },
        { header: "TransactionType", key: "transactionType" },
        { header: "ProductID", key: "productId" },
        { header: "SalesmanID", key: "salesmanId" },
        { header: "PaymentType", key: "paymentType" },
        { header: "QuantityChange", key: "quantityChange" },
        { header: "TotalRevenue", key: "totalRevenue" },
        { header: "TotalCost", key: "totalCost" },
        { header: "LinkedTransactionID", key: "linkedTransactionId" },
        { header: "Notes", key: "notes" },
    ]

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

    // Apply header row styling across data worksheets
    for (const sheet of [prodSheet, salesmanSheet, txSheet]) {
        const headerRow = sheet.getRow(1)
        headerRow.font = { bold: true }
        headerRow.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F4F6" },
        }
    }

    // Auto-fit column widths across all worksheets
    for (const sheet of [dashSheet, prodSheet, salesmanSheet, txSheet]) {
        autoFitWorksheetColumns(sheet)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
}

/**
 * Automatically adjusts column widths of a worksheet based on content string lengths.
 *
 * @param sheet - Target worksheet.
 * @param minWidth - Minimum column width floor (default: 14).
 */
export function autoFitWorksheetColumns(sheet: ExcelJS.Worksheet, minWidth = 12): void {
    sheet.columns.forEach((column) => {
        let maxLen = minWidth
        column.eachCell?.({ includeEmpty: false }, (cell) => {
            // Ignore merged banner/section title cells so they don't artificially inflate column A
            if (cell.isMerged) {
                return
            }

            let text = ""
            if (cell.value !== null && cell.value !== undefined) {
                if (typeof cell.value === "object" && "formula" in cell.value) {
                    const res = (cell.value as { result?: unknown }).result
                    text = res !== undefined && res !== null ? String(res) : "R$ 999.999,00"
                } else {
                    text = String(cell.value)
                }
            }

            if (text.length > maxLen) {
                maxLen = text.length
            }
        })

        column.width = Math.max(minWidth, maxLen + 3)
    })
}
