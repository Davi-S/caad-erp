import type { ProductCreateRequest, ProductUpdateRequest } from "@/types"
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

export function useCreateProduct() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: ProductCreateRequest) => {
            try {
                return await trpcClient.products.add.mutate(input)
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao criar produto."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] })
        },
    })
}

export function useUpdateProduct() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: ProductUpdateRequest }) => {
            try {
                return await trpcClient.products.update.mutate({
                    id,
                    data: input,
                })
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao atualizar produto."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] })
        },
    })
}
