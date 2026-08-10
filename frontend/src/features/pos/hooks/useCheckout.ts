import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { SalesRequests } from "@/types"
import { api } from "@/api/apiClient"

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

export function useCheckout() {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (salesRequests: SalesRequests) => {
            const res = await api.POST("/transactions/bulk-sale", {
                body: { items: salesRequests },
            })
            if (res.error) {
                throw new Error(extractErrorMessage(res.error, "Falha ao registrar a venda."))
            }
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["stock"] })
        },
    })

    return {
        status: mutation.status,
        error: mutation.isError ? mutation.error.message : null,
        confirmPayment: mutation.mutate,
        resetCheckout: mutation.reset,
    }
}
