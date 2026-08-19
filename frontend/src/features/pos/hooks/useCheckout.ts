import type { SalesRequests } from "@/types"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"

function extractErrorMessage(error: unknown, fallback: string): string {
    if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
    ) {
        return (error as { message: string }).message
    }
    return fallback
}

export function useCheckout() {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (salesRequests: SalesRequests) => {
            try {
                const payload = salesRequests.map((req) => ({
                    productId: req.product_id,
                    salesmanId: req.salesman_id,
                    quantity: req.quantity,
                    totalRevenue: req.total_revenue,
                    paymentType: req.payment_type,
                }))
                return await trpcClient.transactions.recordBulkSale.mutate(payload)
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao registrar a venda."))
            }
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
