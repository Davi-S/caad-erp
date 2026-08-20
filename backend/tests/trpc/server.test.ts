import http from "http"
import type { AddressInfo } from "net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createTestDb } from "../bll/setup.js"

// Mock handlePaymentsRoute to test payment routing integration in server.ts
vi.mock("../../src/payments/mercadoPago.js", () => ({
    handlePaymentsRoute: vi.fn().mockImplementation(async (req, res) => {
        const url = req.url ?? ""
        if (url === "/api/payments/handled") {
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ status: "handled" }))
            return true
        }
        return false
    }),
}))

import { createAppServer, shutdownServer, startStandaloneServer } from "../../src/trpc/server.js"

describe("tRPC and Payments HTTP Server (server.ts)", () => {
    let server: http.Server
    let port: number

    beforeAll(async () => {
        const testDb = createTestDb()
        const app = createAppServer(testDb)
        server = app.server

        await new Promise<void>((resolve) => {
            server.listen(0, () => {
                const addr = server.address() as AddressInfo
                port = addr.port
                resolve()
            })
        })
    })

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            shutdownServer(server, undefined, undefined, false, resolve)
        })
    })

    it("handles CORS OPTIONS preflight request for payment endpoints", async () => {
        const res = await fetch(`http://localhost:${port}/api/payments/pix`, {
            method: "OPTIONS",
        })
        expect(res.status).toBe(200)
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
        expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS")
    })

    it("handles CORS OPTIONS preflight request for tRPC endpoints", async () => {
        const res = await fetch(`http://localhost:${port}/trpc/products.list`, {
            method: "OPTIONS",
        })
        expect(res.status).toBe(200)
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
    })

    it("routes /api/payments/ requests to handlePaymentsRoute and returns 200 when handled", async () => {
        const res = await fetch(`http://localhost:${port}/api/payments/handled`)
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data).toEqual({ status: "handled" })
    })

    it("returns 404 Not Found for unhandled /api/payments/ routes", async () => {
        const res = await fetch(`http://localhost:${port}/api/payments/unhandled`)
        expect(res.status).toBe(404)
        const data = await res.json()
        expect(data).toEqual({ error: "Not found" })
    })

    it("dispatches non-payment routes to tRPC handler", async () => {
        const res = await fetch(`http://localhost:${port}/trpc/products.list`)
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data).toHaveProperty("result")
    })

    it("executes shutdownServer with signal string and sqlite instance", async () => {
        const mockSqlite = {
            open: true,
            pragma: vi.fn(),
            close: vi.fn(),
        } as any

        const dummyServer = http.createServer()
        await new Promise<void>((resolve) => {
            shutdownServer(dummyServer, mockSqlite, "SIGINT", false, resolve)
        })

        expect(mockSqlite.pragma).toHaveBeenCalledWith("wal_checkpoint(TRUNCATE)")
        expect(mockSqlite.close).toHaveBeenCalled()
    })

    it("starts standalone server and handles signal listeners", async () => {
        const app = startStandaloneServer(":memory:", 0)
        expect(app.server).toBeDefined()
        expect(app.sqlite).toBeDefined()

        process.emit("SIGINT")
        process.emit("SIGTERM")

        app.cleanup()
        await new Promise<void>((resolve) => {
            shutdownServer(app.server, app.sqlite, undefined, false, resolve)
        })
    })
})
