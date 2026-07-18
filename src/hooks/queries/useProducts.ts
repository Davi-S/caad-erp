import type { Products } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/apiClient"

export function useProducts() {
    return useQuery({
        queryKey: ['products'],
        queryFn: async (): Promise<Products> => {
            const res = await api.GET("/products")
            if (res.error) throw new Error("Failed to fetch products")
            return res.data["items"]
        }
    })
}
