import type { RestockRequest, WriteOffRequest } from "@/types"
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

export function useRestock() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: RestockRequest) => {
            try {
                return await trpcClient.transactions.recordRestock.mutate({
                    productId: input.product_id,
                    salesmanId: input.salesman_id,
                    quantity: input.quantity,
                    totalCost: input.total_cost,
                    notes: input.notes,
                })
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao registrar a reposição."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["stock"] })
        },
    })
}

export function useWriteOff() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: WriteOffRequest) => {
            try {
                return await trpcClient.transactions.recordWriteOff.mutate({
                    productId: input.product_id,
                    salesmanId: input.salesman_id,
                    quantity: input.quantity,
                    notes: input.notes,
                })
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao registrar a baixa."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["stock"] })
        },
    })
}
