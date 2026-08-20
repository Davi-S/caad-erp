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
import type { DB } from "../dal/index.js"
import { schema } from "../dal/index.js"
import { appRouter, createContext } from "./index.js"
import { handlePaymentsRoute } from "../payments/mercadoPago.js"

/**
 * Creates an HTTP server routing between tRPC and REST payment handlers.
 */
export function createAppServer(activeDb?: DB) {
    const database = activeDb ?? drizzle(new Database("caad_erp.db"), { schema })

    const trpcHandler = createHTTPHandler({
        middleware: (_req, res, next) => {
            res.setHeader("Access-Control-Allow-Origin", "*")
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            res.setHeader("Access-Control-Allow-Headers", "content-type, authorization")
            next()
        },
        router: appRouter,
        createContext: () => createContext(database),
    })

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

    return { server, trpcHandler, db: database }
}

/**
 * Shutdown helper for checkpointing SQLite WAL and closing server.
 */
export function shutdownServer(
    server: http.Server,
    sqlite?: Database.Database,
    signal?: string,
    exitProcess: boolean = false,
    callback?: () => void,
) {
    if (signal) console.log(`\n[${signal}] Shutting down...`)
    server.close(() => {
        if (sqlite && sqlite.open) {
            sqlite.pragma("wal_checkpoint(TRUNCATE)")
            sqlite.close()
            console.log("Database closed. Goodbye.")
        }
        if (callback) callback()
        if (exitProcess) process.exit(0)
    })
}

/**
 * Instantiates SQLite database connection and starts standalone server listener.
 */
export function startStandaloneServer(dbPath: string = "caad_erp.db", port: number = 8000) {
    const sqlite = new Database(dbPath)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    const db = drizzle(sqlite, { schema })

    const app = createAppServer(db)
    const serverInstance = app.server

    const listeningServer = serverInstance.listen(port, () => {
        console.log(`tRPC server running at http://localhost:${port}`)
        console.log(`Payments API at http://localhost:${port}/api/payments/pix`)
    })

    const onSigInt = () => shutdownServer(listeningServer, sqlite, "SIGINT", false)
    const onSigTerm = () => shutdownServer(listeningServer, sqlite, "SIGTERM", false)

    process.on("SIGINT", onSigInt)
    process.on("SIGTERM", onSigTerm)

    return {
        server: listeningServer,
        sqlite,
        cleanup: () => {
            process.removeListener("SIGINT", onSigInt)
            process.removeListener("SIGTERM", onSigTerm)
        },
    }
}

// Auto-start listener when not executing inside a test environment
if (process.env.NODE_ENV !== "test") {
    startStandaloneServer()
}
