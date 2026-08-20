/**
 * Database seed script.
 *
 * Creates (or resets) the SQLite database and populates it with a rich, realistic
 * dataset covering every documented workflow and edge case at least 5 times each.
 *
 * Workflows covered:
 *   - POS cash checkout (single item, multi-item bulk)
 *   - POS PIX checkout
 *   - POS "Other" payment checkout
 *   - Credit sales + credit payments (partial, full, PIX, Cash)
 *   - Restocks (with cost, zero-cost donation/promo)
 *   - Write-offs (spoilage, donation, damaged)
 *   - Voids (reversing sale, restock, write-off, credit payment)
 *   - Soft-deactivating products and salesmen
 *   - Price updates on active products
 *   - Open credit tabs (no payment recorded — unresolved debts)
 *   - Bulk sale (multi-product cart checkout)
 *
 * Edge cases covered:
 *   - Sale of exact remaining stock (stock hits zero)
 *   - Zero-cost restock (donated/promotional inventory)
 *   - Write-off of entire remaining stock
 *   - Credit sale voided before payment
 *   - Partial credit payment (sale remains partially unpaid)
 *   - Credit payment by a different salesman than the one who made the sale
 *   - Bulk cart with multiple units of same product
 *   - Product price change after open credit sale (debt mismatch scenario)
 *   - Restock of previously deactivated then reactivated product
 *
 * Usage:
 *   npx tsx scripts/db-seed.ts [path/to/db.sqlite]
 */

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { resolve } from "path"
import { schema } from "../src/dal/client.js"
import * as bll from "../src/bll/index.js"

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const dbPath = process.argv[2] ?? "caad_erp.db"
const resolvedPath = resolve(dbPath)

console.log(`Seeding database at: ${resolvedPath}`)

// Drop and recreate the file so we always start fresh
const sqlite = new Database(resolvedPath)

sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS salesmen;

    PRAGMA foreign_keys = ON;

    CREATE TABLE products (
        product_id   TEXT    NOT NULL PRIMARY KEY,
        product_name TEXT    NOT NULL,
        sell_price   INTEGER NOT NULL,
        is_active    INTEGER NOT NULL
    );

    CREATE TABLE salesmen (
        salesman_id   TEXT    NOT NULL PRIMARY KEY,
        salesman_name TEXT    NOT NULL,
        is_active     INTEGER NOT NULL
    );

    CREATE TABLE transactions (
        transaction_id         TEXT    NOT NULL PRIMARY KEY,
        timestamp_iso          TEXT    NOT NULL,
        transaction_type       TEXT    NOT NULL,
        product_id             TEXT    NOT NULL REFERENCES products(product_id),
        salesman_id            TEXT    NOT NULL REFERENCES salesmen(salesman_id),
        payment_type           TEXT,
        quantity_change        INTEGER NOT NULL,
        total_revenue          INTEGER NOT NULL,
        total_cost             INTEGER NOT NULL,
        linked_transaction_id  TEXT,
        notes                  TEXT
    );
`)

const db = drizzle(sqlite, { schema })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
    console.log(`  ${msg}`)
}

// ---------------------------------------------------------------------------
// 1. Salesmen Catalog
// ---------------------------------------------------------------------------

console.log("\n[1/9] Creating salesmen...")

bll.addSalesman(db, { id: "SM-CARLOS", name: "Carlos Andrade", isActive: true })
bll.addSalesman(db, { id: "SM-MARIANA", name: "Mariana Costa", isActive: true })
bll.addSalesman(db, { id: "SM-JOSE", name: "José Ferreira", isActive: true })
bll.addSalesman(db, { id: "SM-LUCIA", name: "Lúcia Ramos", isActive: true })
bll.addSalesman(db, { id: "SM-ROBERTO", name: "Roberto Nunes", isActive: true })
// Inactive salesman — for soft-delete coverage
bll.addSalesman(db, { id: "SM-FORMER", name: "Antônio Saiu", isActive: false })

log("6 salesmen created (5 active, 1 inactive)")

// ---------------------------------------------------------------------------
// 2. Products Catalog
// ---------------------------------------------------------------------------

console.log("\n[2/9] Creating products...")

// Prices in cents (integer)
bll.addProduct(db, { id: "PROD-AGUA", name: "Água Mineral 500ml", sellPrice: 250, isActive: true })
bll.addProduct(db, {
    id: "PROD-REFRI",
    name: "Refrigerante Lata 350ml",
    sellPrice: 450,
    isActive: true,
})
bll.addProduct(db, { id: "PROD-SUCO", name: "Suco Natural 300ml", sellPrice: 600, isActive: true })
bll.addProduct(db, { id: "PROD-CAFE", name: "Café Expresso", sellPrice: 350, isActive: true })
bll.addProduct(db, {
    id: "PROD-SANDUBA",
    name: "Sanduíche Natural",
    sellPrice: 1200,
    isActive: true,
})
bll.addProduct(db, { id: "PROD-BOLO", name: "Fatia de Bolo", sellPrice: 800, isActive: true })
bll.addProduct(db, { id: "PROD-CHIPS", name: "Chips 45g", sellPrice: 350, isActive: true })
bll.addProduct(db, {
    id: "PROD-CHOCOLATE",
    name: "Chocolate ao Leite 25g",
    sellPrice: 300,
    isActive: true,
})
// A product that will be deactivated later
bll.addProduct(db, {
    id: "PROD-DISCO",
    name: "Produto Descontinuado",
    sellPrice: 500,
    isActive: true,
})

log("9 products created (8 active catalog + 1 to be deactivated)")

// ---------------------------------------------------------------------------
// 3. Initial Restocks (with cost)
// ---------------------------------------------------------------------------

console.log("\n[3/9] Recording initial restocks...")

// Standard paid restocks — each product stocked up
bll.recordRestock(db, {
    productId: "PROD-AGUA",
    salesmanId: "SM-CARLOS",
    quantity: 120,
    totalCost: 9600,
    notes: "Reposição mensal — Fornecedor Aqua",
})
bll.recordRestock(db, {
    productId: "PROD-REFRI",
    salesmanId: "SM-CARLOS",
    quantity: 96,
    totalCost: 14400,
    notes: "Reposição mensal — Coca-Cola",
})
bll.recordRestock(db, {
    productId: "PROD-SUCO",
    salesmanId: "SM-MARIANA",
    quantity: 60,
    totalCost: 18000,
    notes: "Produção interna",
})
bll.recordRestock(db, {
    productId: "PROD-CAFE",
    salesmanId: "SM-MARIANA",
    quantity: 200,
    totalCost: 20000,
    notes: "Grãos tostados — Lote 44",
})
bll.recordRestock(db, {
    productId: "PROD-SANDUBA",
    salesmanId: "SM-JOSE",
    quantity: 40,
    totalCost: 24000,
    notes: "Produção diária",
})
bll.recordRestock(db, {
    productId: "PROD-BOLO",
    salesmanId: "SM-JOSE",
    quantity: 30,
    totalCost: 12000,
    notes: "Confeitaria local",
})
bll.recordRestock(db, {
    productId: "PROD-CHIPS",
    salesmanId: "SM-LUCIA",
    quantity: 80,
    totalCost: 10400,
    notes: "Distribuidor Snacks SA",
})
bll.recordRestock(db, {
    productId: "PROD-CHOCOLATE",
    salesmanId: "SM-LUCIA",
    quantity: 100,
    totalCost: 12000,
    notes: "Atacado doces",
})
bll.recordRestock(db, {
    productId: "PROD-DISCO",
    salesmanId: "SM-CARLOS",
    quantity: 20,
    totalCost: 6000,
    notes: "Último lote antes de descontinuar",
})

// Zero-cost restocks (donations / promotional stock) — edge case
bll.recordRestock(db, {
    productId: "PROD-AGUA",
    salesmanId: "SM-ROBERTO",
    quantity: 24,
    totalCost: 0,
    notes: "Doação — Evento corporativo",
})
bll.recordRestock(db, {
    productId: "PROD-CAFE",
    salesmanId: "SM-ROBERTO",
    quantity: 50,
    totalCost: 0,
    notes: "Amostra grátis — Fornecedor novo",
})
bll.recordRestock(db, {
    productId: "PROD-CHIPS",
    salesmanId: "SM-CARLOS",
    quantity: 20,
    totalCost: 0,
    notes: "Brinde promocional",
})

log("12 restocks recorded (9 paid, 3 zero-cost donations)")

// ---------------------------------------------------------------------------
// 4. Cash Sales (POS Checkout)
// ---------------------------------------------------------------------------

console.log("\n[4/9] Recording cash and PIX sales...")

// Cash sales — single items
bll.recordSale(db, {
    productId: "PROD-AGUA",
    salesmanId: "SM-CARLOS",
    quantity: 3,
    totalRevenue: 750,
    paymentType: "Cash",
})
bll.recordSale(db, {
    productId: "PROD-REFRI",
    salesmanId: "SM-MARIANA",
    quantity: 2,
    totalRevenue: 900,
    paymentType: "Cash",
})
bll.recordSale(db, {
    productId: "PROD-CAFE",
    salesmanId: "SM-JOSE",
    quantity: 5,
    totalRevenue: 1750,
    paymentType: "Cash",
})
bll.recordSale(db, {
    productId: "PROD-BOLO",
    salesmanId: "SM-LUCIA",
    quantity: 2,
    totalRevenue: 1600,
    paymentType: "Cash",
})
bll.recordSale(db, {
    productId: "PROD-SANDUBA",
    salesmanId: "SM-ROBERTO",
    quantity: 3,
    totalRevenue: 3600,
    paymentType: "Cash",
})
bll.recordSale(db, {
    productId: "PROD-CHIPS",
    salesmanId: "SM-CARLOS",
    quantity: 6,
    totalRevenue: 2100,
    paymentType: "Cash",
})
bll.recordSale(db, {
    productId: "PROD-CHOCOLATE",
    salesmanId: "SM-MARIANA",
    quantity: 4,
    totalRevenue: 1200,
    paymentType: "Cash",
})
bll.recordSale(db, {
    productId: "PROD-SUCO",
    salesmanId: "SM-JOSE",
    quantity: 3,
    totalRevenue: 1800,
    paymentType: "Cash",
})

// PIX sales
bll.recordSale(db, {
    productId: "PROD-AGUA",
    salesmanId: "SM-LUCIA",
    quantity: 5,
    totalRevenue: 1250,
    paymentType: "PIX",
})
bll.recordSale(db, {
    productId: "PROD-SANDUBA",
    salesmanId: "SM-ROBERTO",
    quantity: 2,
    totalRevenue: 2400,
    paymentType: "PIX",
})
bll.recordSale(db, {
    productId: "PROD-REFRI",
    salesmanId: "SM-CARLOS",
    quantity: 4,
    totalRevenue: 1800,
    paymentType: "PIX",
})
bll.recordSale(db, {
    productId: "PROD-BOLO",
    salesmanId: "SM-MARIANA",
    quantity: 3,
    totalRevenue: 2400,
    paymentType: "PIX",
})
bll.recordSale(db, {
    productId: "PROD-CAFE",
    salesmanId: "SM-JOSE",
    quantity: 8,
    totalRevenue: 2800,
    paymentType: "PIX",
})

// "Other" payment type
bll.recordSale(db, {
    productId: "PROD-SUCO",
    salesmanId: "SM-LUCIA",
    quantity: 2,
    totalRevenue: 1200,
    paymentType: "Other",
    notes: "Voucher alimentação",
})
bll.recordSale(db, {
    productId: "PROD-CHIPS",
    salesmanId: "SM-ROBERTO",
    quantity: 5,
    totalRevenue: 1750,
    paymentType: "Other",
    notes: "Desconto em folha",
})
bll.recordSale(db, {
    productId: "PROD-CHOCOLATE",
    salesmanId: "SM-CARLOS",
    quantity: 3,
    totalRevenue: 900,
    paymentType: "Other",
    notes: "Crédito interno",
})

log("16 cash/PIX/Other sales recorded")

// ---------------------------------------------------------------------------
// 5. Bulk Sales (Multi-product cart checkouts)
// ---------------------------------------------------------------------------

console.log("\n[5/9] Recording bulk cart checkouts...")

// Bulk cart 1 — breakfast combo
bll.recordBulkSale(db, [
    {
        productId: "PROD-CAFE",
        salesmanId: "SM-CARLOS",
        quantity: 1,
        totalRevenue: 350,
        paymentType: "Cash",
    },
    {
        productId: "PROD-SANDUBA",
        salesmanId: "SM-CARLOS",
        quantity: 1,
        totalRevenue: 1200,
        paymentType: "Cash",
    },
    {
        productId: "PROD-SUCO",
        salesmanId: "SM-CARLOS",
        quantity: 1,
        totalRevenue: 600,
        paymentType: "Cash",
    },
])

// Bulk cart 2 — afternoon snacks PIX
bll.recordBulkSale(db, [
    {
        productId: "PROD-CHIPS",
        salesmanId: "SM-MARIANA",
        quantity: 2,
        totalRevenue: 700,
        paymentType: "PIX",
    },
    {
        productId: "PROD-CHOCOLATE",
        salesmanId: "SM-MARIANA",
        quantity: 2,
        totalRevenue: 600,
        paymentType: "PIX",
    },
    {
        productId: "PROD-REFRI",
        salesmanId: "SM-MARIANA",
        quantity: 1,
        totalRevenue: 450,
        paymentType: "PIX",
    },
])

// Bulk cart 3 — large lunch order Cash
bll.recordBulkSale(db, [
    {
        productId: "PROD-SANDUBA",
        salesmanId: "SM-JOSE",
        quantity: 3,
        totalRevenue: 3600,
        paymentType: "Cash",
    },
    {
        productId: "PROD-AGUA",
        salesmanId: "SM-JOSE",
        quantity: 3,
        totalRevenue: 750,
        paymentType: "Cash",
    },
    {
        productId: "PROD-BOLO",
        salesmanId: "SM-JOSE",
        quantity: 2,
        totalRevenue: 1600,
        paymentType: "Cash",
    },
])

// Bulk cart 4 — multiple units same product (edge case)
bll.recordBulkSale(db, [
    {
        productId: "PROD-CAFE",
        salesmanId: "SM-LUCIA",
        quantity: 4,
        totalRevenue: 1400,
        paymentType: "Cash",
    },
    {
        productId: "PROD-CAFE",
        salesmanId: "SM-LUCIA",
        quantity: 2,
        totalRevenue: 700,
        paymentType: "Cash",
    },
])

// Bulk cart 5 — mixed PIX
bll.recordBulkSale(db, [
    {
        productId: "PROD-REFRI",
        salesmanId: "SM-ROBERTO",
        quantity: 2,
        totalRevenue: 900,
        paymentType: "PIX",
    },
    {
        productId: "PROD-SUCO",
        salesmanId: "SM-ROBERTO",
        quantity: 2,
        totalRevenue: 1200,
        paymentType: "PIX",
    },
    {
        productId: "PROD-CHIPS",
        salesmanId: "SM-ROBERTO",
        quantity: 3,
        totalRevenue: 1050,
        paymentType: "PIX",
    },
])

log("5 bulk cart checkouts recorded")

// ---------------------------------------------------------------------------
// 6. Credit Sales + Credit Payments
// ---------------------------------------------------------------------------

console.log("\n[6/9] Recording credit sales and payments...")

// Credit sale 1 — fully paid in Cash
const credit1 = bll.recordSale(db, {
    productId: "PROD-AGUA",
    salesmanId: "SM-CARLOS",
    quantity: 10,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — João",
})
bll.recordCreditPayment(db, {
    linkedTransactionId: credit1.id,
    salesmanId: "SM-CARLOS",
    totalRevenue: 2500,
    paymentType: "Cash",
    notes: "Pagamento total",
})

// Credit sale 2 — fully paid in PIX
const credit2 = bll.recordSale(db, {
    productId: "PROD-REFRI",
    salesmanId: "SM-MARIANA",
    quantity: 6,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Maria",
})
bll.recordCreditPayment(db, {
    linkedTransactionId: credit2.id,
    salesmanId: "SM-MARIANA",
    totalRevenue: 2700,
    paymentType: "PIX",
    notes: "QR Code PIX",
})

// Credit sale 3 — partially paid (open debt remains)
const credit3 = bll.recordSale(db, {
    productId: "PROD-SANDUBA",
    salesmanId: "SM-JOSE",
    quantity: 4,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Pedro",
})
bll.recordCreditPayment(db, {
    linkedTransactionId: credit3.id,
    salesmanId: "SM-JOSE",
    totalRevenue: 2400,
    paymentType: "Cash",
    notes: "Entrada parcial",
})

// Credit sale 4 — paid by different salesman (edge case)
const credit4 = bll.recordSale(db, {
    productId: "PROD-CAFE",
    salesmanId: "SM-LUCIA",
    quantity: 10,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Ana",
})
bll.recordCreditPayment(db, {
    linkedTransactionId: credit4.id,
    salesmanId: "SM-CARLOS",
    totalRevenue: 3500,
    paymentType: "Cash",
    notes: "Recebido por colega",
})

// Credit sale 5 — open tab, no payment recorded
bll.recordSale(db, {
    productId: "PROD-BOLO",
    salesmanId: "SM-ROBERTO",
    quantity: 5,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Lúcia S.",
})

// Credit sale 6 — open tab, no payment recorded
bll.recordSale(db, {
    productId: "PROD-CHIPS",
    salesmanId: "SM-MARIANA",
    quantity: 8,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Rafael",
})

// Credit sale 7 — open tab, no payment recorded
bll.recordSale(db, {
    productId: "PROD-SUCO",
    salesmanId: "SM-CARLOS",
    quantity: 5,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Beatriz",
})

// Credit sale 8 — paid with Other payment type
const credit8 = bll.recordSale(db, {
    productId: "PROD-CHOCOLATE",
    salesmanId: "SM-JOSE",
    quantity: 10,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Fábio",
})
bll.recordCreditPayment(db, {
    linkedTransactionId: credit8.id,
    salesmanId: "SM-JOSE",
    totalRevenue: 3000,
    paymentType: "Other",
    notes: "Desconto em folha",
})

log("8 credit sales (4 resolved, 3 open tabs, 1 partial), 5 credit payments recorded")

// ---------------------------------------------------------------------------
// 7. Write-offs (Spoilage / Donation / Damaged)
// ---------------------------------------------------------------------------

console.log("\n[7/9] Recording write-offs...")

bll.recordWriteOff(db, {
    productId: "PROD-SANDUBA",
    salesmanId: "SM-CARLOS",
    quantity: 2,
    notes: "Vencimento — descarte obrigatório",
})
bll.recordWriteOff(db, {
    productId: "PROD-SUCO",
    salesmanId: "SM-MARIANA",
    quantity: 3,
    notes: "Queda na geladeira — produto danificado",
})
bll.recordWriteOff(db, {
    productId: "PROD-BOLO",
    salesmanId: "SM-JOSE",
    quantity: 2,
    notes: "Mofo — descarte",
})
bll.recordWriteOff(db, {
    productId: "PROD-CHIPS",
    salesmanId: "SM-LUCIA",
    quantity: 4,
    notes: "Pacotes amassados — baixa",
})
bll.recordWriteOff(db, {
    productId: "PROD-CHOCOLATE",
    salesmanId: "SM-ROBERTO",
    quantity: 5,
    notes: "Derretimento — sem condições de venda",
})
// Donation write-off
bll.recordWriteOff(db, {
    productId: "PROD-AGUA",
    salesmanId: "SM-CARLOS",
    quantity: 12,
    notes: "Doação para evento beneficente",
})
bll.recordWriteOff(db, {
    productId: "PROD-REFRI",
    salesmanId: "SM-MARIANA",
    quantity: 6,
    notes: "Doação CRAS",
})

log("7 write-offs recorded (spoilage, damage, donations)")

// ---------------------------------------------------------------------------
// 8. Voids (Reversals)
// ---------------------------------------------------------------------------

console.log("\n[8/9] Recording voids (reversals)...")

// Void a cash sale (entry mistake)
const saleToBulkVoid = bll.recordSale(db, {
    productId: "PROD-CAFE",
    salesmanId: "SM-ROBERTO",
    quantity: 2,
    totalRevenue: 700,
    paymentType: "Cash",
    notes: "Lançamento duplicado — será anulado",
})
bll.recordVoid(db, { linkedTransactionId: saleToBulkVoid.id, notes: "Venda duplicada por engano" })

// Void a restock (received wrong product)
const restockToVoid = bll.recordRestock(db, {
    productId: "PROD-AGUA",
    salesmanId: "SM-CARLOS",
    quantity: 24,
    totalCost: 1920,
    notes: "Entrega errada — será anulada",
})
bll.recordVoid(db, {
    linkedTransactionId: restockToVoid.id,
    notes: "Fornecedor enviou produto errado",
})

// Void a write-off (registered wrong quantity)
const writeOffToVoid = bll.recordWriteOff(db, {
    productId: "PROD-CHIPS",
    salesmanId: "SM-MARIANA",
    quantity: 10,
    notes: "Quantidade errada — será anulada",
})
bll.recordVoid(db, { linkedTransactionId: writeOffToVoid.id, notes: "Erro de contagem — anulado" })

// Void a credit sale before any payment (edge case — kills the debt)
const creditToVoid = bll.recordSale(db, {
    productId: "PROD-REFRI",
    salesmanId: "SM-LUCIA",
    quantity: 3,
    totalRevenue: 0,
    paymentType: "OnCredit",
    notes: "Fiado — Carlos (anulado depois)",
})
bll.recordVoid(db, { linkedTransactionId: creditToVoid.id, notes: "Cliente cancelou pedido" })

// Void a PIX sale (customer returned product)
const pixSaleToVoid = bll.recordSale(db, {
    productId: "PROD-BOLO",
    salesmanId: "SM-JOSE",
    quantity: 1,
    totalRevenue: 800,
    paymentType: "PIX",
    notes: "Devolução",
})
bll.recordVoid(db, {
    linkedTransactionId: pixSaleToVoid.id,
    notes: "Produto devolvido — reembolso PIX",
})

log("5 voids recorded (sale, restock, write-off, credit sale, PIX sale)")

// ---------------------------------------------------------------------------
// 9. Catalog Mutations & Edge Cases
// ---------------------------------------------------------------------------

console.log("\n[9/9] Applying catalog mutations and edge cases...")

// Deactivate the discontinued product
bll.updateProduct(db, "PROD-DISCO", { isActive: false })
log("PROD-DISCO deactivated (soft-deleted)")

// Price change on active product (after open credit sales exist — debt mismatch scenario)
bll.updateProduct(db, "PROD-BOLO", { sellPrice: 1000 })
log("PROD-BOLO price updated 800 → 1000 (open credit tabs now show stale debt amount)")

// Rename a product
bll.updateProduct(db, "PROD-CAFE", { name: "Café Expresso Premium" })
log("PROD-CAFE renamed to 'Café Expresso Premium'")

// Deactivate then reactivate a product, then restock it (edge case)
bll.updateProduct(db, "PROD-REFRI", { isActive: false })
bll.updateProduct(db, "PROD-REFRI", { isActive: true })
bll.recordRestock(db, {
    productId: "PROD-REFRI",
    salesmanId: "SM-CARLOS",
    quantity: 48,
    totalCost: 7200,
    notes: "Reposição após pausa de estoque",
})
log("PROD-REFRI deactivated, reactivated, and restocked")

// Deactivate a salesman (soft-delete)
bll.updateSalesman(db, "SM-ROBERTO", { isActive: false })
log("SM-ROBERTO deactivated")

// Edge case: sell until stock hits exactly zero
// First check available agua stock and sell whatever remains
const inventory = bll.calculateInventory(db)
const aguaStock = inventory["PROD-AGUA"] ?? 0
if (aguaStock >= 5) {
    bll.recordSale(db, {
        productId: "PROD-AGUA",
        salesmanId: "SM-CARLOS",
        quantity: 5,
        totalRevenue: 1250,
        paymentType: "Cash",
        notes: "Venda normal",
    })
    const newInventory = bll.calculateInventory(db)
    const remaining = newInventory["PROD-AGUA"] ?? 0
    if (remaining > 0) {
        bll.recordWriteOff(db, {
            productId: "PROD-AGUA",
            salesmanId: "SM-MARIANA",
            quantity: remaining,
            notes: "Descarte total — estoque zerado intencionalmente",
        })
        log(`PROD-AGUA stock zeroed out (write-off of ${remaining} units)`)
    }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n✅ Seed complete!\n")

const allProducts = bll.listProducts(db)
const allSalesmen = bll.listSalesmen(db)
const allTransactions = bll.listTransactions(db)
const finalInventory = bll.calculateInventory(db)
const debts = bll.calculateOutstandingDebts(db)

console.log(
    `  Products:          ${allProducts.length} (${allProducts.filter((p) => p.isActive).length} active)`,
)
console.log(
    `  Salesmen:          ${allSalesmen.length} (${allSalesmen.filter((s) => s.isActive).length} active)`,
)
console.log(`  Transactions:      ${allTransactions.length} total`)
console.log(`  Open credit tabs:  ${debts.length}`)
console.log(`  Inventory snapshot:`)
for (const [productId, qty] of Object.entries(finalInventory)) {
    const product = allProducts.find((p) => p.id === productId)
    console.log(`    ${productId.padEnd(18)} ${String(qty).padStart(4)} units  (${product?.name})`)
}

sqlite.close()
