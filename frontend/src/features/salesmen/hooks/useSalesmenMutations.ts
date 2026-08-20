import type { SalesmanCreateRequest, SalesmanUpdateRequest } from "@/types"
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

export function useCreateSalesman() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: SalesmanCreateRequest) => {
            try {
                return await trpcClient.salesmen.add.mutate(input)
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao criar vendedor."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["salesmen"] })
        },
    })
}

export function useUpdateSalesman() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: SalesmanUpdateRequest }) => {
            try {
                return await trpcClient.salesmen.update.mutate({
                    id,
                    data: input,
                })
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao atualizar vendedor."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["salesmen"] })
        },
    })
}
