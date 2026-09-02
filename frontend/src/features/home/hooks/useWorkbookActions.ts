/**
 * Custom hooks encapsulating Excel workbook export and import operations via tRPC.
 */

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"
import { useAppConfig } from "@/config"

export interface ImportWorkbookResult {
    productsCount: number
    salesmenCount: number
    transactionsCount: number
}

/**
 * Custom hook for exporting and downloading the Excel workbook.
 */
export function useExportWorkbook() {
    const { config } = useAppConfig()
    const [isExporting, setIsExporting] = useState(false)

    const exportWorkbook = async () => {
        setIsExporting(true)
        try {
            const data = await trpcClient.reports.exportWorkbook.query()
            const binaryStr = window.atob(data.base64)
            const len = binaryStr.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i)
            }
            const blob = new Blob([bytes], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = config.excelDefaultFilename || data.filename || "caad_erp_workbook.xlsx"
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Falha ao exportar planilha."
            console.error(msg, err)
            throw new Error(msg)
        } finally {
            setIsExporting(false)
        }
    }

    return {
        exportWorkbook,
        isExporting,
    }
}

/**
 * Helper to read a File object as a Base64 string.
 */
function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("Erro ao ler o arquivo selecionado."))
        reader.readAsDataURL(file)
    })
}

/**
 * Custom hook for uploading an Excel workbook and replacing current database state.
 */
export function useImportWorkbook() {
    const queryClient = useQueryClient()

    return useMutation<ImportWorkbookResult, Error, File>({
        mutationFn: async (file: File) => {
            const base64 = await readFileAsBase64(file)
            const res = await trpcClient.reports.importWorkbook.mutate({ base64 })
            return {
                productsCount: res.count?.productsCount ?? 0,
                salesmenCount: res.count?.salesmenCount ?? 0,
                transactionsCount: res.count?.transactionsCount ?? 0,
            }
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries()
        },
    })
}
