/**
 * Unit test suite for domain mutation hooks (Products, Salesmen, Stock).
 */

import React from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
    useCreateProduct,
    useUpdateProduct,
} from "../../src/features/products/hooks/useProductsMutations"
import {
    useCreateSalesman,
    useUpdateSalesman,
} from "../../src/features/salesmen/hooks/useSalesmenMutations"
import { useRestock, useWriteOff } from "../../src/features/stock/hooks/useStockMutations"
import { trpcClient } from "../../src/utils/trpc"

vi.mock("../../src/utils/trpc", () => ({
    trpcClient: {
        products: {
            add: { mutate: vi.fn() },
            update: { mutate: vi.fn() },
        },
        salesmen: {
            add: { mutate: vi.fn() },
            update: { mutate: vi.fn() },
        },
        transactions: {
            recordRestock: { mutate: vi.fn() },
            recordWriteOff: { mutate: vi.fn() },
        },
    },
}))

describe("Domain Mutation Hooks", () => {
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

    describe("Product Mutations", () => {
        it("GIVEN valid product input WHEN useCreateProduct executes THEN calls tRPC and invalidates products query", async () => {
            vi.mocked(trpcClient.products.add.mutate).mockResolvedValueOnce({ id: "P1" } as any)
            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

            const { result } = renderHook(() => useCreateProduct(), { wrapper })

            await act(async () => {
                await result.current.mutateAsync({
                    name: "Guaraná",
                    sellPrice: 600,
                    isActive: true,
                })
            })

            expect(trpcClient.products.add.mutate).toHaveBeenCalledWith({
                name: "Guaraná",
                sellPrice: 600,
                isActive: true,
            })
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] })
        })

        it("GIVEN error response WHEN useCreateProduct fails THEN throws extracted or fallback error", async () => {
            vi.mocked(trpcClient.products.add.mutate).mockRejectedValueOnce(
                new Error("Produto já cadastrado."),
            )

            const { result } = renderHook(() => useCreateProduct(), { wrapper })

            await expect(
                act(async () => {
                    await result.current.mutateAsync({
                        name: "Guaraná",
                        sellPrice: 600,
                        isActive: true,
                    })
                }),
            ).rejects.toThrow("Produto já cadastrado.")
        })

        it("GIVEN update input WHEN useUpdateProduct executes THEN calls tRPC update and invalidates products", async () => {
            vi.mocked(trpcClient.products.update.mutate).mockResolvedValueOnce({ id: "P1" } as any)
            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

            const { result } = renderHook(() => useUpdateProduct(), { wrapper })

            await act(async () => {
                await result.current.mutateAsync({
                    id: "P1",
                    input: { sellPrice: 700 },
                })
            })

            expect(trpcClient.products.update.mutate).toHaveBeenCalledWith({
                id: "P1",
                data: { sellPrice: 700 },
            })
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] })
        })

        it("GIVEN update error response WHEN useUpdateProduct fails THEN throws error", async () => {
            vi.mocked(trpcClient.products.update.mutate).mockRejectedValueOnce(
                new Error("Falha ao atualizar."),
            )

            const { result } = renderHook(() => useUpdateProduct(), { wrapper })

            await expect(
                act(async () => {
                    await result.current.mutateAsync({
                        id: "P1",
                        input: { sellPrice: 700 },
                    })
                }),
            ).rejects.toThrow("Falha ao atualizar.")
        })

        it("GIVEN non-object error WHEN useCreateProduct fails THEN uses fallback error", async () => {
            vi.mocked(trpcClient.products.add.mutate).mockRejectedValueOnce("unexpected error")

            const { result } = renderHook(() => useCreateProduct(), { wrapper })

            await expect(
                act(async () => {
                    await result.current.mutateAsync({
                        name: "Guaraná",
                        sellPrice: 600,
                        isActive: true,
                    })
                }),
            ).rejects.toThrow("Falha ao criar produto.")
        })
    })

    describe("Salesmen Mutations", () => {
        it("GIVEN valid salesman WHEN useCreateSalesman executes THEN adds salesman and invalidates salesmen query", async () => {
            vi.mocked(trpcClient.salesmen.add.mutate).mockResolvedValueOnce({ id: "S1" } as any)
            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

            const { result } = renderHook(() => useCreateSalesman(), { wrapper })

            await act(async () => {
                await result.current.mutateAsync({
                    name: "Mariana",
                    isActive: true,
                })
            })

            expect(trpcClient.salesmen.add.mutate).toHaveBeenCalledWith({
                name: "Mariana",
                isActive: true,
            })
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["salesmen"] })
        })

        it("GIVEN error response WHEN useCreateSalesman fails THEN throws error", async () => {
            vi.mocked(trpcClient.salesmen.add.mutate).mockRejectedValueOnce(
                new Error("Vendedor duplicado."),
            )

            const { result } = renderHook(() => useCreateSalesman(), { wrapper })

            await expect(
                act(async () => {
                    await result.current.mutateAsync({
                        name: "Mariana",
                        isActive: true,
                    })
                }),
            ).rejects.toThrow("Vendedor duplicado.")
        })

        it("GIVEN salesman update WHEN useUpdateSalesman executes THEN updates salesman record", async () => {
            vi.mocked(trpcClient.salesmen.update.mutate).mockResolvedValueOnce({ id: "S1" } as any)
            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

            const { result } = renderHook(() => useUpdateSalesman(), { wrapper })

            await act(async () => {
                await result.current.mutateAsync({
                    id: "S1",
                    input: { isActive: false },
                })
            })

            expect(trpcClient.salesmen.update.mutate).toHaveBeenCalledWith({
                id: "S1",
                data: { isActive: false },
            })
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["salesmen"] })
        })

        it("GIVEN update error WHEN useUpdateSalesman fails THEN throws error", async () => {
            vi.mocked(trpcClient.salesmen.update.mutate).mockRejectedValueOnce(
                new Error("Falha no update."),
            )

            const { result } = renderHook(() => useUpdateSalesman(), { wrapper })

            await expect(
                act(async () => {
                    await result.current.mutateAsync({
                        id: "S1",
                        input: { isActive: false },
                    })
                }),
            ).rejects.toThrow("Falha no update.")
        })
    })

    describe("Stock Mutations", () => {
        it("GIVEN restock input WHEN useRestock executes THEN records restock and invalidates stock query", async () => {
            vi.mocked(trpcClient.transactions.recordRestock.mutate).mockResolvedValueOnce({
                id: "T1",
            } as any)
            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

            const { result } = renderHook(() => useRestock(), { wrapper })

            await act(async () => {
                await result.current.mutateAsync({
                    productId: "P1",
                    quantity: 20,
                    costPerUnit: 300,
                })
            })

            expect(trpcClient.transactions.recordRestock.mutate).toHaveBeenCalledWith({
                productId: "P1",
                quantity: 20,
                costPerUnit: 300,
            })
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stock"] })
        })

        it("GIVEN restock error WHEN useRestock fails THEN throws error", async () => {
            vi.mocked(trpcClient.transactions.recordRestock.mutate).mockRejectedValueOnce(
                new Error("Quantidade inválida."),
            )

            const { result } = renderHook(() => useRestock(), { wrapper })

            await expect(
                act(async () => {
                    await result.current.mutateAsync({
                        productId: "P1",
                        quantity: -5,
                        costPerUnit: 300,
                    })
                }),
            ).rejects.toThrow("Quantidade inválida.")
        })

        it("GIVEN writeOff input WHEN useWriteOff executes THEN records writeOff and invalidates stock query", async () => {
            vi.mocked(trpcClient.transactions.recordWriteOff.mutate).mockResolvedValueOnce({
                id: "T2",
            } as any)
            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

            const { result } = renderHook(() => useWriteOff(), { wrapper })

            await act(async () => {
                await result.current.mutateAsync({
                    productId: "P1",
                    quantity: 3,
                    reason: "Vencido",
                })
            })

            expect(trpcClient.transactions.recordWriteOff.mutate).toHaveBeenCalledWith({
                productId: "P1",
                quantity: 3,
                reason: "Vencido",
            })
            expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stock"] })
        })

        it("GIVEN writeOff error WHEN useWriteOff fails THEN throws error", async () => {
            vi.mocked(trpcClient.transactions.recordWriteOff.mutate).mockRejectedValueOnce(
                new Error("Estoque insuficiente para baixa."),
            )

            const { result } = renderHook(() => useWriteOff(), { wrapper })

            await expect(
                act(async () => {
                    await result.current.mutateAsync({
                        productId: "P1",
                        quantity: 3,
                        reason: "Vencido",
                    })
                }),
            ).rejects.toThrow("Estoque insuficiente para baixa.")
        })
    })
})
