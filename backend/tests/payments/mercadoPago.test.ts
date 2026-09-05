import { EventEmitter } from "events"
import type { IncomingMessage, ServerResponse } from "http"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock mercadopago SDK module
const mockPaymentCreate = vi.fn()
const mockPaymentGet = vi.fn()

vi.mock("mercadopago", () => {
    return {
        MercadoPagoConfig: vi.fn().mockImplementation((opts) => opts),
        Payment: vi.fn().mockImplementation(() => ({
            create: mockPaymentCreate,
            get: mockPaymentGet,
        })),
    }
})

let mockConfig = {
    mercadoPagoAccessToken: "TEST_ACCESS_TOKEN",
    mercadoPagoPayerEmail: "cliente@caad.com.br",
}
vi.mock("../../src/config.js", () => {
    return {
        getBackendConfig: () => mockConfig,
    }
})

import { handlePaymentsRoute } from "../../src/payments/mercadoPago.js"

// Helper to construct mock HTTP request and response
function createMockReqRes(
    method: string,
    url: string | undefined,
    bodyPayload?: unknown,
    emitErrorOnRead: boolean = false,
) {
    const req = new EventEmitter() as unknown as IncomingMessage & EventEmitter
    req.method = method
    req.url = url as any

    const res = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: "",
        writeHead(status: number, headers: Record<string, string>) {
            this.statusCode = status
            this.headers = headers
        },
        end(data?: string) {
            if (data) this.body += data
        },
    } as unknown as ServerResponse & {
        statusCode: number
        headers: Record<string, string>
        body: string
    }

    const triggerReq = async () => {
        if (emitErrorOnRead) {
            req.emit("error", new Error("Read stream failure"))
        } else if (bodyPayload !== undefined) {
            const dataStr =
                typeof bodyPayload === "string" ? bodyPayload : JSON.stringify(bodyPayload)
            req.emit("data", Buffer.from(dataStr))
            req.emit("end")
        } else {
            req.emit("end")
        }
    }

    return { req, res, triggerReq }
}

describe("Mercado Pago Payment Route Handler", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockConfig.mercadoPagoAccessToken = "TEST_ACCESS_TOKEN"
    })

    describe("handlePaymentsRoute routing", () => {
        it("returns false when request path/method does not match any payment route", async () => {
            const { req, res } = createMockReqRes("GET", "/api/payments/unknown")
            const handled = await handlePaymentsRoute(req, res)
            expect(handled).toBe(false)
        })

        it("handles undefined req.url gracefully", async () => {
            const { req, res } = createMockReqRes("GET", undefined)
            const handled = await handlePaymentsRoute(req, res)
            expect(handled).toBe(false)
        })
    })

    describe("POST /api/payments/pix (handleCreatePix)", () => {
        it("throws error if MERCADO_PAGO_ACCESS_TOKEN is not configured", async () => {
            mockConfig.mercadoPagoAccessToken = ""
            const { req, res, triggerReq } = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: 10,
                description: "Test",
            })

            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(502)
            expect(JSON.parse(res.body)).toEqual({
                error: "MERCADO_PAGO_ACCESS_TOKEN is not configured in the settings.",
            })
        })

        it("returns 400 when request body contains empty body string", async () => {
            const { req, res, triggerReq } = createMockReqRes("POST", "/api/payments/pix", "")
            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(400)
            expect(JSON.parse(res.body)).toEqual({
                error: "transactionAmount must be a positive number",
            })
        })

        it("returns 400 when request body contains invalid JSON", async () => {
            const { req, res, triggerReq } = createMockReqRes(
                "POST",
                "/api/payments/pix",
                "invalid { json",
            )
            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(400)
            expect(JSON.parse(res.body)).toEqual({ error: "Invalid request body" })
        })

        it("returns 400 when stream reading emits an error", async () => {
            const { req, res, triggerReq } = createMockReqRes(
                "POST",
                "/api/payments/pix",
                undefined,
                true,
            )
            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(400)
            expect(JSON.parse(res.body)).toEqual({ error: "Invalid request body" })
        })

        it("returns 400 when transactionAmount is missing or <= 0", async () => {
            const { req, res, triggerReq } = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: -5,
                description: "Test",
            })
            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(400)
            expect(JSON.parse(res.body)).toEqual({
                error: "transactionAmount must be a positive number",
            })
        })

        it("returns 400 when description is empty or invalid", async () => {
            const { req, res, triggerReq } = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: 10,
                description: "   ",
            })
            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(400)
            expect(JSON.parse(res.body)).toEqual({
                error: "description must be a non-empty string",
            })
        })

        it("returns 502 when Mercado Pago API response lacks QR code or ID", async () => {
            mockPaymentCreate.mockResolvedValueOnce({})
            const { req, res, triggerReq } = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: 50,
                description: "Sample sale",
            })

            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(502)
            expect(JSON.parse(res.body)).toEqual({ error: "Resposta inválida do Mercado Pago" })
        })

        it("returns 200 with id and qr_code_base64 on success", async () => {
            mockPaymentCreate.mockResolvedValueOnce({
                id: 123456,
                point_of_interaction: {
                    transaction_data: {
                        qr_code_base64: "BASE64_QR_CODE_DATA",
                    },
                },
            })

            const { req, res, triggerReq } = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: 50,
                description: "Sample sale",
            })

            const routePromise = handlePaymentsRoute(req, res)
            await triggerReq()
            await routePromise

            expect(res.statusCode).toBe(200)
            expect(JSON.parse(res.body)).toEqual({
                id: 123456,
                qr_code_base64: "BASE64_QR_CODE_DATA",
            })
        })

        it("formats error messages correctly when Mercado Pago throws an exception", async () => {
            // Case A: cause array
            mockPaymentCreate.mockRejectedValueOnce({
                cause: [{ description: "Detail error 1" }, { code: "ERR_2" }, { other: "val" }],
            })
            let result = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: 10,
                description: "Test",
            })
            let promise = handlePaymentsRoute(result.req, result.res)
            await result.triggerReq()
            await promise
            expect(result.res.statusCode).toBe(502)
            expect(JSON.parse(result.res.body).error).toContain("Detail error 1; ERR_2;")

            // Case B: cause string
            mockPaymentCreate.mockRejectedValueOnce({ cause: "String error cause" })
            result = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: 10,
                description: "Test",
            })
            promise = handlePaymentsRoute(result.req, result.res)
            await result.triggerReq()
            await promise
            expect(JSON.parse(result.res.body).error).toBe("String error cause")

            // Case C: cause object
            mockPaymentCreate.mockRejectedValueOnce({ cause: { detail: "obj cause" } })
            result = createMockReqRes("POST", "/api/payments/pix", {
                transactionAmount: 10,
                description: "Test",
            })
            promise = handlePaymentsRoute(result.req, result.res)
            await result.triggerReq()
            await promise
            expect(JSON.parse(result.res.body).error).toBe('{"detail":"obj cause"}')
        })
    })

    describe("GET /api/payments/pix/:id (handleGetPixStatus)", () => {
        it("returns 400 for invalid non-numeric or non-positive payment ID", async () => {
            const { req, res, triggerReq } = createMockReqRes("GET", "/api/payments/pix/invalid-id")
            const promise = handlePaymentsRoute(req, res)
            await triggerReq()
            await promise

            expect(res.statusCode).toBe(400)
            expect(JSON.parse(res.body)).toEqual({ error: "Invalid payment ID" })
        })

        it("returns 200 with payment status on successful lookup", async () => {
            mockPaymentGet.mockResolvedValueOnce({ status: "approved" })
            const { req, res, triggerReq } = createMockReqRes("GET", "/api/payments/pix/98765")
            const promise = handlePaymentsRoute(req, res)
            await triggerReq()
            await promise

            expect(res.statusCode).toBe(200)
            expect(JSON.parse(res.body)).toEqual({ status: "approved" })
        })

        it("returns 200 with fallback status 'unknown' when status property is missing", async () => {
            mockPaymentGet.mockResolvedValueOnce({})
            const { req, res, triggerReq } = createMockReqRes("GET", "/api/payments/pix/98765")
            const promise = handlePaymentsRoute(req, res)
            await triggerReq()
            await promise

            expect(res.statusCode).toBe(200)
            expect(JSON.parse(res.body)).toEqual({ status: "unknown" })
        })

        it("returns 502 when Payment.get throws an error", async () => {
            mockPaymentGet.mockRejectedValueOnce(new Error("API connection failure"))
            const { req, res, triggerReq } = createMockReqRes("GET", "/api/payments/pix/98765")
            const promise = handlePaymentsRoute(req, res)
            await triggerReq()
            await promise

            expect(res.statusCode).toBe(502)
            expect(JSON.parse(res.body)).toEqual({ error: "API connection failure" })

            // Test non-Error exception
            mockPaymentGet.mockRejectedValueOnce("Unknown raw exception")
            const result = createMockReqRes("GET", "/api/payments/pix/98765")
            const promise2 = handlePaymentsRoute(result.req, result.res)
            await result.triggerReq()
            await promise2

            expect(result.res.statusCode).toBe(502)
            expect(JSON.parse(result.res.body)).toEqual({
                error: "Erro interno ao consultar status do pagamento",
            })
        })
    })
})
