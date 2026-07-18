
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/apiClient"
import type { Stock } from "@/types"

export function useStock() {
    return useQuery({
        queryKey: ['stock'],
        queryFn: async (): Promise<Stock> => {
            const res = await api.GET("/reports/stock")
            if (res.error) throw new Error("Failed to fetch stock")

            // Transform data to the fast format
            const stockMap: Stock = {}
            for (const item of res.data["items"]) {
                stockMap[item.product_id] = item.quantity
            }
            return stockMap
        }
    })
}
