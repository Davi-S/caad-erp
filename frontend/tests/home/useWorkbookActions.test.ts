/**
 * Unit test suite for useExportWorkbook and useImportWorkbook hooks.
 */

import React from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    useExportWorkbook,
    useImportWorkbook,
} from "../../src/features/home/hooks/useWorkbookActions"
import { trpcClient } from "../../src/utils/trpc"

vi.mock("../../src/utils/trpc", () => ({
    trpcClient: {
        reports: {
            exportWorkbook: {
                query: vi.fn(),
            },
            importWorkbook: {
                mutate: vi.fn(),
            },
        },
    },
}))

describe("useWorkbookActions", () => {
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

        // Mock URL and DOM link methods
        global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url")
        global.URL.revokeObjectURL = vi.fn()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe("useExportWorkbook", () => {
        it("GIVEN successful export query WHEN exportWorkbook is invoked THEN downloads xlsx file and resets isExporting", async () => {
            // "Hello" in base64: "SGVsbG8="
            vi.mocked(trpcClient.reports.exportWorkbook.query).mockResolvedValueOnce({
                base64: "SGVsbG8=",
                filename: "backup_2026.xlsx",
            } as any)

            const clickSpy = vi
                .spyOn(HTMLAnchorElement.prototype, "click")
                .mockImplementation(() => {})

            const { result } = renderHook(() => useExportWorkbook())

            expect(result.current.isExporting).toBe(false)

            await act(async () => {
                await result.current.exportWorkbook()
            })

            expect(trpcClient.reports.exportWorkbook.query).toHaveBeenCalled()
            expect(global.URL.createObjectURL).toHaveBeenCalled()
            expect(clickSpy).toHaveBeenCalled()
            expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
            expect(result.current.isExporting).toBe(false)
        })

        it("GIVEN successful export without filename WHEN exportWorkbook is invoked THEN uses default filename fallback", async () => {
            vi.mocked(trpcClient.reports.exportWorkbook.query).mockResolvedValueOnce({
                base64: "SGVsbG8=",
                filename: undefined,
            } as any)

            vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

            const { result } = renderHook(() => useExportWorkbook())

            await act(async () => {
                await result.current.exportWorkbook()
            })

            expect(result.current.isExporting).toBe(false)
        })

        it("GIVEN export failure with unknown non-Error WHEN exportWorkbook throws THEN captures fallback error and resets isExporting", async () => {
            vi.mocked(trpcClient.reports.exportWorkbook.query).mockRejectedValueOnce(
                "raw export failure string",
            )

            const { result } = renderHook(() => useExportWorkbook())

            await expect(
                act(async () => {
                    await result.current.exportWorkbook()
                }),
            ).rejects.toThrow("Falha ao exportar planilha.")

            expect(result.current.isExporting).toBe(false)
        })
    })

    describe("useImportWorkbook", () => {
        it("GIVEN valid file WHEN mutateAsync is called THEN reads file, calls tRPC mutate, and invalidates queries", async () => {
            vi.mocked(trpcClient.reports.importWorkbook.mutate).mockResolvedValueOnce({
                count: {
                    productsCount: 10,
                    salesmenCount: 4,
                    transactionsCount: 25,
                },
            } as any)

            const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

            // Mock FileReader
            class MockFileReader {
                result: string | null = null
                onload: (() => void) | null = null
                onerror: (() => void) | null = null
                readAsDataURL() {
                    this.result = "data:application/vnd.ms-excel;base64,bW9ja19maWxl"
                    this.onload?.()
                }
            }
            const originalFileReader = global.FileReader
            global.FileReader = MockFileReader as any

            const { result } = renderHook(() => useImportWorkbook(), { wrapper })

            const mockFile = new File(["dummy content"], "planilha.xlsx", {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })

            let mutationResult
            await act(async () => {
                mutationResult = await result.current.mutateAsync(mockFile)
            })

            expect(mutationResult).toEqual({
                productsCount: 10,
                salesmenCount: 4,
                transactionsCount: 25,
            })
            expect(trpcClient.reports.importWorkbook.mutate).toHaveBeenCalledWith({
                base64: "data:application/vnd.ms-excel;base64,bW9ja19maWxl",
            })
            expect(invalidateSpy).toHaveBeenCalled()

            global.FileReader = originalFileReader
        })

        it("GIVEN file reader error WHEN reading file fails THEN throws error", async () => {
            class FailingFileReader {
                onload: (() => void) | null = null
                onerror: (() => void) | null = null
                readAsDataURL() {
                    this.onerror?.()
                }
            }
            const originalFileReader = global.FileReader
            global.FileReader = FailingFileReader as any

            const { result } = renderHook(() => useImportWorkbook(), { wrapper })

            const mockFile = new File(["dummy"], "corrupted.xlsx")

            await expect(
                act(async () => {
                    await result.current.mutateAsync(mockFile)
                }),
            ).rejects.toThrow("Erro ao ler o arquivo selecionado.")

            global.FileReader = originalFileReader
        })
    })
})
