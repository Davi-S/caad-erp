/**
 * Unit test suite for query hooks and options (Products, Salesmen, Stock).
 */

import React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { productsQueryOptions, useProducts } from "../../src/hooks/queries/useProducts"
import { salesmenQueryOptions, useSalesmen } from "../../src/hooks/queries/useSalesmen"
import { stockQueryOptions, useStock } from "../../src/hooks/queries/useStock"
import { trpcClient } from "../../src/utils/trpc"

vi.mock("../../src/utils/trpc", () => ({
    trpcClient: {
        products: {
            list: { query: vi.fn() },
        },
        salesmen: {
            list: { query: vi.fn() },
        },
        reports: {
            inventory: { query: vi.fn() },
        },
    },
}))

describe("Query Hooks and QueryOptions", () => {
    let queryClient: QueryClient

    const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

    beforeEach(() => {
        vi.restoreAllMocks()
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        })
    })

    describe("products query", () => {
        it("GIVEN productsQueryOptions WHEN queryFn is executed THEN calls trpc products.list", async () => {
            const mockProducts = [{ id: "P1", name: "Suco", sellPrice: 400, isActive: true }]
            vi.mocked(trpcClient.products.list.query).mockResolvedValueOnce(mockProducts as any)

            const options = productsQueryOptions()
            expect(options.queryKey).toEqual(["products"])

            const result = await options.queryFn()
            expect(trpcClient.products.list.query).toHaveBeenCalled()
            expect(result).toEqual(mockProducts)
        })

        it("GIVEN useProducts hook WHEN rendered THEN fetches product list from tRPC", async () => {
            const mockProducts = [{ id: "P1", name: "Suco", sellPrice: 400, isActive: true }]
            vi.mocked(trpcClient.products.list.query).mockResolvedValueOnce(mockProducts as any)

            const { result } = renderHook(() => useProducts(), { wrapper })

            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true)
            })

            expect(result.current.data).toEqual(mockProducts)
        })
    })

    describe("salesmen query", () => {
        it("GIVEN salesmenQueryOptions WHEN queryFn is executed THEN calls trpc salesmen.list", async () => {
            const mockSalesmen = [{ id: "S1", name: "Davi", isActive: true }]
            vi.mocked(trpcClient.salesmen.list.query).mockResolvedValueOnce(mockSalesmen as any)

            const options = salesmenQueryOptions()
            expect(options.queryKey).toEqual(["salesmen"])

            const result = await options.queryFn()
            expect(trpcClient.salesmen.list.query).toHaveBeenCalled()
            expect(result).toEqual(mockSalesmen)
        })

        it("GIVEN useSalesmen hook WHEN rendered THEN fetches salesmen list from tRPC", async () => {
            const mockSalesmen = [{ id: "S1", name: "Davi", isActive: true }]
            vi.mocked(trpcClient.salesmen.list.query).mockResolvedValueOnce(mockSalesmen as any)

            const { result } = renderHook(() => useSalesmen(), { wrapper })

            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true)
            })

            expect(result.current.data).toEqual(mockSalesmen)
        })
    })

    describe("stock query", () => {
        it("GIVEN stockQueryOptions WHEN queryFn is executed THEN calls trpc reports.inventory", async () => {
            const mockStock = { P1: 15, P2: 0 }
            vi.mocked(trpcClient.reports.inventory.query).mockResolvedValueOnce(mockStock as any)

            const options = stockQueryOptions()
            expect(options.queryKey).toEqual(["stock"])

            const result = await options.queryFn()
            expect(trpcClient.reports.inventory.query).toHaveBeenCalled()
            expect(result).toEqual(mockStock)
        })

        it("GIVEN useStock hook WHEN rendered THEN fetches inventory stock mapping from tRPC", async () => {
            const mockStock = { P1: 15, P2: 0 }
            vi.mocked(trpcClient.reports.inventory.query).mockResolvedValueOnce(mockStock as any)

            const { result } = renderHook(() => useStock(), { wrapper })

            await waitFor(() => {
                expect(result.current.isSuccess).toBe(true)
            })

            expect(result.current.data).toEqual(mockStock)
        })
    })
})
