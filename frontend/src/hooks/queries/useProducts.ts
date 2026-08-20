import type { Product } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"

export const productsQueryOptions = () => ({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
        return trpcClient.products.list.query()
    },
})

export function useProducts() {
    return useQuery(productsQueryOptions())
}
