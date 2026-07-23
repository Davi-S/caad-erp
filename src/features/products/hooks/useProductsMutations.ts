import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/apiClient"
import type { ProductCreateRequest, ProductUpdateRequest } from "@/types"

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

export function useCreateProduct() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: ProductCreateRequest) => {
            const res = await api.POST("/products", { body: input })
            if (res.error)
                throw new Error(extractErrorMessage(res.error, "Falha ao criar produto."))
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] })
        },
    })
}

export function useUpdateProduct() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            productId,
            input,
        }: {
            productId: string
            input: ProductUpdateRequest
        }) => {
            const res = await api.PATCH("/products/{product_id}", {
                params: { path: { product_id: productId } },
                body: input,
            })
            if (res.error)
                throw new Error(extractErrorMessage(res.error, "Falha ao atualizar produto."))
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] })
        },
    })
}
