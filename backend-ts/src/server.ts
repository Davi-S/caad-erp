/**
 * Standalone Node HTTP server runner serving tRPC procedures on port 8000.
 */

import { createHTTPServer } from "@trpc/server/adapters/standalone"
import { createDb } from "./dal/index.js"
import { appRouter, createContext } from "./trpc/index.js"

// Initialize SQLite database connection client
const db = createDb()

// Create standalone HTTP server instance with CORS enabled for frontend client
const server = createHTTPServer({
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

const PORT = 8000

server.listen(PORT, () => {
    console.log(`tRPC server running at http://localhost:${PORT}/trpc`)
})
