import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { SalesRequests } from "@/App"
import { api } from "@/api/apiClient"

export function useCheckout() {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        // The function that actually performs the action
        mutationFn: async (salesRequests: SalesRequests) => {
            // TODO: Update this when the api updates to accept multiple products
            // per sale.
            for (const saleRequest of salesRequests) {
                const res = await api.POST("/transactions/sale", { body: saleRequest })
                // Throwing an error here to trigger the mutation's error state
                if (res.error) throw new Error("Falha ao registrar a venda.")
            }
        },
        // What happens when the mutation succeeds
        onSuccess: () => {
            // This tells TanStack Query that the 'stock' cache is now invalid.
            // It will automatically refetch the stock from the API in the background.
            queryClient.invalidateQueries({ queryKey: ['stock'] })
        }
    })

        return {
        status: mutation.status,
        error: mutation.isError ? mutation.error.message : null,
        confirmPayment: mutation.mutate,
        resetCheckout: mutation.reset
    }
}
