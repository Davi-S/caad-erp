/**
 * Unit test suite for Mercado Pago client API functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPixPayment, checkPaymentStatus } from "../../src/api/mercadoPago"

describe("Mercado Pago API Client", () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        global.fetch = vi.fn()
    })

    afterEach(() => {
        global.fetch = originalFetch
        vi.restoreAllMocks()
    })

    describe("createPixPayment", () => {
        it("GIVEN valid payment params WHEN createPixPayment succeeds THEN returns pix response payload", async () => {
            const mockResponse = { id: 12345, qr_code_base64: "base64qrdata" }
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const result = await createPixPayment(2500, "Venda - João")

            expect(global.fetch).toHaveBeenCalledWith("/api/payments/pix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transactionAmount: 2500, description: "Venda - João" }),
            })
            expect(result).toEqual(mockResponse)
        })

        it("GIVEN API error with message WHEN createPixPayment fails THEN throws custom error from payload", async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: "Valor de transação inválido." }),
            } as Response)

            await expect(createPixPayment(-50, "Desc")).rejects.toThrow(
                "Valor de transação inválido.",
            )
        })

        it("GIVEN API error without JSON error message WHEN createPixPayment fails THEN throws fallback HTTP error", async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error("Invalid JSON")
                },
            } as unknown as Response)

            await expect(createPixPayment(100, "Desc")).rejects.toThrow(
                "Falha ao gerar QR Code PIX (HTTP 500).",
            )
        })
    })

    describe("checkPaymentStatus", () => {
        it("GIVEN existing paymentId WHEN checkPaymentStatus succeeds THEN returns status response", async () => {
            const mockResponse = { status: "approved" }
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response)

            const result = await checkPaymentStatus(98765)

            expect(global.fetch).toHaveBeenCalledWith("/api/payments/pix/98765")
            expect(result).toEqual(mockResponse)
        })

        it("GIVEN paymentId WHEN API returns error response THEN throws error with payload message", async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: "Pagamento não encontrado." }),
            } as Response)

            await expect(checkPaymentStatus("non-existent-id")).rejects.toThrow(
                "Pagamento não encontrado.",
            )
        })

        it("GIVEN paymentId WHEN API returns unparseable error response THEN throws fallback HTTP error", async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                status: 502,
                json: async () => {
                    throw new Error("Invalid JSON")
                },
            } as unknown as Response)

            await expect(checkPaymentStatus(111)).rejects.toThrow(
                "Falha ao verificar status do pagamento (HTTP 502).",
            )
        })
    })
})
