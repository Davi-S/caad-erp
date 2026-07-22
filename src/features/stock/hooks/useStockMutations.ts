import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/apiClient"
import type { RestockRequest, WriteOffRequest } from "@/types"

function extractErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === "object" && "detail" in error && typeof (error as { detail: unknown }).detail === "string") {
        return (error as { detail: string }).detail
    }
    return fallback
}

export function useRestock() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: RestockRequest) => {
            const res = await api.POST("/transactions/restock", { body: input })
            if (res.error) throw new Error(extractErrorMessage(res.error, "Falha ao registrar a reposição."))
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stock'] })
        }
    })
}

export function useWriteOff() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: WriteOffRequest) => {
            const res = await api.POST("/transactions/write-off", { body: input })
            if (res.error) throw new Error(extractErrorMessage(res.error, "Falha ao registrar a baixa."))
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stock'] })
        }
    })
}
