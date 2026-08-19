/**
 * Standalone Node HTTP server serving tRPC procedures and REST payment routes
 * on port 8000.
 *
 * Routes:
 *   ALL  /trpc/*               - tRPC batch handler
 *   POST /api/payments/pix     - Mercado Pago PIX QR code creation
 *   GET  /api/payments/pix/:id - Mercado Pago payment status poll
 */

import "dotenv/config"
import { createHTTPHandler } from "@trpc/server/adapters/standalone"
import http from "http"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { schema } from "../dal/index.js"
import { appRouter, createContext } from "./index.js"
import { handlePaymentsRoute } from "../payments/mercadoPago.js"

// Create the raw SQLite connection so we can checkpoint it on shutdown
const sqlite = new Database("caad_erp.db")
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

const db = drizzle(sqlite, { schema })

// Build the tRPC handler (handles any path, does NOT create a server itself)
const trpcHandler = createHTTPHandler({
    middleware: (req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "content-type, authorization")
        if (req.method === "OPTIONS") {
            res.statusCode = 200
            res.end()
            return
        }
        next()
    },
    router: appRouter,
    createContext: () => createContext(db),
})

// Create a plain HTTP server that routes between tRPC and REST handlers
const server = http.createServer(async (req, res) => {
    const url = req.url ?? ""

    // CORS preflight for payment routes
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "content-type")
        res.statusCode = 200
        res.end()
        return
    }

    // REST: Mercado Pago payment routes
    if (url.startsWith("/api/payments/")) {
        res.setHeader("Access-Control-Allow-Origin", "*")
        const handled = await handlePaymentsRoute(req, res)
        if (!handled) {
            res.writeHead(404, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Not found" }))
        }
        return
    }

    // tRPC: all other routes
    trpcHandler(req, res)
})

const PORT = 8000

server.listen(PORT, () => {
    console.log(`tRPC server running at http://localhost:${PORT}`)
    console.log(`Payments API at http://localhost:${PORT}/api/payments/pix`)
})

// Graceful shutdown — checkpoint WAL so the -shm and -wal sidecar files are
// merged back into the main .db file and removed cleanly on process exit.
function shutdown(signal: string) {
    console.log(`\n[${signal}] Shutting down...`)
    server.close(() => {
        sqlite.pragma("wal_checkpoint(TRUNCATE)")
        sqlite.close()
        console.log("Database closed. Goodbye.")
        process.exit(0)
    })
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
