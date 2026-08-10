import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/apiClient"
import type { SalesmanCreateRequest, SalesmanUpdateRequest } from "@/types"

function extractErrorMessage(error: unknown, fallback: string): string {
    if (
        error &&
        typeof error === "object" &&
        "detail" in error &&
        typeof (error as { detail: unknown }).detail === "string"
    ) {
        return (error as { detail: string }).detail
    }
    return fallback
}

export function useCreateSalesman() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: SalesmanCreateRequest) => {
            const res = await api.POST("/salesmen", { body: input })
            if (res.error)
                throw new Error(extractErrorMessage(res.error, "Falha ao criar vendedor."))
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["salesmen"] })
        },
    })
}

export function useUpdateSalesman() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            salesmanId,
            input,
        }: {
            salesmanId: string
            input: SalesmanUpdateRequest
        }) => {
            const res = await api.PATCH("/salesmen/{salesman_id}", {
                params: { path: { salesman_id: salesmanId } },
                body: input,
            })
            if (res.error)
                throw new Error(extractErrorMessage(res.error, "Falha ao atualizar vendedor."))
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["salesmen"] })
        },
    })
}
