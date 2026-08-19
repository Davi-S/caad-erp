import type { Products } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"

export const productsQueryOptions = () => ({
    queryKey: ["products"],
    queryFn: async (): Promise<Products> => {
        const list = await trpcClient.products.list.query()
        return list.map((p) => ({
            product_id: p.productId,
            product_name: p.productName,
            sell_price: p.sellPrice,
            is_active: p.isActive,
        }))
    },
})

export function useProducts() {
    return useQuery(productsQueryOptions())
}
