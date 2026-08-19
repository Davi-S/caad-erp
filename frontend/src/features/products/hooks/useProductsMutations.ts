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
                const product = await trpcClient.products.add.mutate({
                    productId: input.product_id,
                    productName: input.product_name,
                    sellPrice: input.sell_price,
                    isActive: input.is_active,
                })
                return {
                    product_id: product.productId,
                    product_name: product.productName,
                    sell_price: product.sellPrice,
                    is_active: product.isActive,
                }
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
        mutationFn: async ({
            productId,
            input,
        }: {
            productId: string
            input: ProductUpdateRequest
        }) => {
            try {
                const product = await trpcClient.products.update.mutate({
                    productId,
                    data: {
                        productName: input.product_name,
                        sellPrice: input.sell_price,
                        isActive: input.is_active,
                    },
                })
                return {
                    product_id: product.productId,
                    product_name: product.productName,
                    sell_price: product.sellPrice,
                    is_active: product.isActive,
                }
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao atualizar produto."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] })
        },
    })
}
