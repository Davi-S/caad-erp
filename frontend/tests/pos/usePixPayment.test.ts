/**
 * Unit test suite for usePixPayment hook with polling and retry mechanisms.
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePixPayment } from "../../src/features/pos/hooks/usePixPayment"
import * as mercadoPagoApi from "../../src/api/mercadoPago"

vi.mock("../../src/api/mercadoPago")

describe("usePixPayment Hook", () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("GIVEN amountInBrl <= 0 WHEN mounted THEN does not initiate PIX payment creation", () => {
        const onPaymentApproved = vi.fn()

        const { result } = renderHook(() =>
            usePixPayment({
                amountInBrl: 0,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        expect(mercadoPagoApi.createPixPayment).not.toHaveBeenCalled()
        expect(result.current.paymentId).toBeNull()
        expect(result.current.qrCodeBase64).toBeNull()
    })

    it("GIVEN confirmed is true WHEN mounted THEN does not trigger PIX creation", () => {
        const onPaymentApproved = vi.fn()

        renderHook(() =>
            usePixPayment({
                amountInBrl: 25.5,
                salesmanName: "Davi",
                confirmed: true,
                onPaymentApproved,
            }),
        )

        expect(mercadoPagoApi.createPixPayment).not.toHaveBeenCalled()
    })

    it("GIVEN positive amount WHEN mounted THEN creates PIX payment and saves payload", async () => {
        vi.mocked(mercadoPagoApi.createPixPayment).mockResolvedValueOnce({
            id: 9999,
            qr_code_base64: "mock_qr_base64_data",
        })
        const onPaymentApproved = vi.fn()

        const { result } = renderHook(() =>
            usePixPayment({
                amountInBrl: 50,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        await act(async () => {
            // allow createPixPayment promise to resolve
            await Promise.resolve()
        })

        expect(mercadoPagoApi.createPixPayment).toHaveBeenCalledWith(50, "Venda - Davi")
        expect(result.current.paymentId).toBe(9999)
        expect(result.current.qrCodeBase64).toBe("mock_qr_base64_data")
        expect(result.current.error).toBeNull()
    })

    it("GIVEN active paymentId WHEN polling detects approved status THEN triggers onPaymentApproved and clears interval", async () => {
        vi.mocked(mercadoPagoApi.createPixPayment).mockResolvedValueOnce({
            id: 1234,
            qr_code_base64: "qr_data",
        })
        vi.mocked(mercadoPagoApi.checkPaymentStatus).mockResolvedValue({
            status: "approved",
        })

        const onPaymentApproved = vi.fn()

        renderHook(() =>
            usePixPayment({
                amountInBrl: 30,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(mercadoPagoApi.createPixPayment).toHaveBeenCalledTimes(1)

        // Advance timers by 3000ms to trigger status check
        await act(async () => {
            vi.advanceTimersByTime(3000)
            await Promise.resolve()
        })

        expect(mercadoPagoApi.checkPaymentStatus).toHaveBeenCalledWith(1234)
        expect(onPaymentApproved).toHaveBeenCalledTimes(1)

        // Advance further to verify interval has stopped
        await act(async () => {
            vi.advanceTimersByTime(6000)
            await Promise.resolve()
        })
        expect(mercadoPagoApi.checkPaymentStatus).toHaveBeenCalledTimes(1)
    })

    it("GIVEN error during createPixPayment WHEN creation fails THEN captures error message", async () => {
        vi.mocked(mercadoPagoApi.createPixPayment).mockRejectedValueOnce(
            new Error("Falha na comunicação com o Mercado Pago."),
        )
        const onPaymentApproved = vi.fn()

        const { result } = renderHook(() =>
            usePixPayment({
                amountInBrl: 15,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(result.current.error).toBe("Falha na comunicação com o Mercado Pago.")
        expect(result.current.loading).toBe(false)
    })

    it("GIVEN polling error during status check WHEN checking status fails THEN sets error state", async () => {
        vi.mocked(mercadoPagoApi.createPixPayment).mockResolvedValueOnce({
            id: 7777,
            qr_code_base64: "qr",
        })
        vi.mocked(mercadoPagoApi.checkPaymentStatus).mockRejectedValueOnce(
            new Error("Erro de conexão durante polling."),
        )
        const onPaymentApproved = vi.fn()

        const { result } = renderHook(() =>
            usePixPayment({
                amountInBrl: 10,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        await act(async () => {
            await Promise.resolve()
        })

        await act(async () => {
            vi.advanceTimersByTime(3000)
            await Promise.resolve()
        })

        expect(result.current.error).toBe("Erro de conexão durante polling.")
    })

    it("GIVEN failed creation WHEN retry is triggered THEN attempts to create payment again", async () => {
        vi.mocked(mercadoPagoApi.createPixPayment)
            .mockRejectedValueOnce(new Error("Erro temporário"))
            .mockResolvedValueOnce({ id: 8888, qr_code_base64: "qr_retry" })

        const onPaymentApproved = vi.fn()

        const { result } = renderHook(() =>
            usePixPayment({
                amountInBrl: 20,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        await act(async () => {
            await Promise.resolve()
        })

        await act(async () => {
            result.current.retry()
            await Promise.resolve()
        })

        expect(mercadoPagoApi.createPixPayment).toHaveBeenCalledTimes(2)
        expect(result.current.paymentId).toBe(8888)
        expect(result.current.qrCodeBase64).toBe("qr_retry")
        expect(result.current.error).toBeNull()
    })

    it("GIVEN active PIX payment already fetched WHEN re-rendered with identical params THEN does not duplicate createPixPayment call", async () => {
        vi.mocked(mercadoPagoApi.createPixPayment).mockResolvedValueOnce({
            id: 1111,
            qr_code_base64: "qr_same",
        })

        const onPaymentApproved = vi.fn()

        const { rerender } = renderHook(
            (props: { amount: number; name: string }) =>
                usePixPayment({
                    amountInBrl: props.amount,
                    salesmanName: props.name,
                    confirmed: false,
                    onPaymentApproved,
                }),
            { initialProps: { amount: 50, name: "Davi" } },
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(mercadoPagoApi.createPixPayment).toHaveBeenCalledTimes(1)

        // Rerender with same props
        rerender({ amount: 50, name: "Davi" })

        await act(async () => {
            await Promise.resolve()
        })

        expect(mercadoPagoApi.createPixPayment).toHaveBeenCalledTimes(1)
    })

    it("GIVEN non-Error thrown during create or polling WHEN failure occurs THEN uses fallback error messages", async () => {
        vi.mocked(mercadoPagoApi.createPixPayment).mockRejectedValueOnce("raw string failure")

        const onPaymentApproved = vi.fn()

        const { result } = renderHook(() =>
            usePixPayment({
                amountInBrl: 10,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(result.current.error).toBe("Erro ao gerar PIX com Mercado Pago.")

        // Test polling non-Error failure
        vi.mocked(mercadoPagoApi.createPixPayment).mockResolvedValueOnce({
            id: 2222,
            qr_code_base64: "qr2",
        })
        vi.mocked(mercadoPagoApi.checkPaymentStatus).mockRejectedValueOnce("status failure string")

        const { result: resultPolling } = renderHook(() =>
            usePixPayment({
                amountInBrl: 12,
                salesmanName: "Davi",
                confirmed: false,
                onPaymentApproved,
            }),
        )

        await act(async () => {
            await Promise.resolve()
        })

        await act(async () => {
            vi.advanceTimersByTime(3000)
            await Promise.resolve()
        })

        expect(resultPolling.current.error).toBe(
            "Erro ao verificar status do pagamento PIX no Mercado Pago.",
        )
    })
})
