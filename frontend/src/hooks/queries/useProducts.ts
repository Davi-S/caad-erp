import type { Products } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/apiClient"

export const productsQueryOptions = () => ({
    queryKey: ["products"],
    queryFn: async (): Promise<Products> => {
        const res = await api.GET("/products")
        if (res.error) throw new Error("Failed to fetch products")
        return res.data["items"]
    },
})

export function useProducts() {
    return useQuery(productsQueryOptions())
}
