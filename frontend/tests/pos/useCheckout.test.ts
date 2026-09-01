/**
 * Unit test suite for useCheckout hook.
 */

import React from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCheckout } from "../../src/features/pos/hooks/useCheckout"
import { trpcClient } from "../../src/utils/trpc"
import type { SaleRequest } from "../../src/types"

vi.mock("../../src/utils/trpc", () => ({
    trpcClient: {
        transactions: {
            recordBulkSale: {
                mutate: vi.fn(),
            },
        },
    },
}))

describe("useCheckout Hook", () => {
    let queryClient: QueryClient

    const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

    beforeEach(() => {
        vi.restoreAllMocks()
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        })
    })

    const sampleSaleRequests: SaleRequest[] = [
        {
            productId: "P1",
            salesmanId: "S1",
            quantity: 2,
            totalRevenue: 1000,
            paymentType: "PIX",
            notes: null,
        },
    ]

    it("GIVEN initial render WHEN useCheckout is mounted THEN status is idle with no error", () => {
        const { result } = renderHook(() => useCheckout(), { wrapper })

        expect(result.current.status).toBe("idle")
        expect(result.current.error).toBeNull()
    })

    it("GIVEN successful sale recording WHEN confirmPayment is invoked THEN mutates tRPC and invalidates stock queries", async () => {
        vi.mocked(trpcClient.transactions.recordBulkSale.mutate).mockResolvedValueOnce([] as any)
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCheckout(), { wrapper })

        act(() => {
            result.current.confirmPayment(sampleSaleRequests)
        })

        await waitFor(() => {
            expect(result.current.status).toBe("success")
        })

        expect(trpcClient.transactions.recordBulkSale.mutate).toHaveBeenCalledWith(
            sampleSaleRequests,
        )
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stock"] })
    })

    it("GIVEN failed sale recording with custom error WHEN confirmPayment fails THEN populates error message", async () => {
        vi.mocked(trpcClient.transactions.recordBulkSale.mutate).mockRejectedValueOnce(
            new Error("Estoque insuficiente para o produto."),
        )

        const { result } = renderHook(() => useCheckout(), { wrapper })

        act(() => {
            result.current.confirmPayment(sampleSaleRequests)
        })

        await waitFor(() => {
            expect(result.current.status).toBe("error")
        })

        expect(result.current.error).toBe("Estoque insuficiente para o produto.")
    })

    it("GIVEN failed sale recording with unknown error WHEN confirmPayment fails THEN uses fallback error message", async () => {
        vi.mocked(trpcClient.transactions.recordBulkSale.mutate).mockRejectedValueOnce(
            "non-error-obj",
        )

        const { result } = renderHook(() => useCheckout(), { wrapper })

        act(() => {
            result.current.confirmPayment(sampleSaleRequests)
        })

        await waitFor(() => {
            expect(result.current.status).toBe("error")
        })

        expect(result.current.error).toBe("Falha ao registrar a venda.")
    })

    it("GIVEN error state WHEN resetCheckout is called THEN resets status to idle", async () => {
        vi.mocked(trpcClient.transactions.recordBulkSale.mutate).mockRejectedValueOnce(
            new Error("Erro temporário"),
        )

        const { result } = renderHook(() => useCheckout(), { wrapper })

        act(() => {
            result.current.confirmPayment(sampleSaleRequests)
        })

        await waitFor(() => {
            expect(result.current.status).toBe("error")
        })

        act(() => {
            result.current.resetCheckout()
        })

        await waitFor(() => {
            expect(result.current.status).toBe("idle")
        })
        expect(result.current.error).toBeNull()
    })
})
