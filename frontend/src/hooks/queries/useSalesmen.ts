import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/apiClient"
import type { Salesmen } from "@/types"

export const salesmenQueryOptions = () => ({
    queryKey: ["salesmen"],
    queryFn: async (): Promise<Salesmen> => {
        const res = await api.GET("/salesmen")
        if (res.error) throw new Error("Failed to fetch salesmen")
        return res.data["items"]
    },
})

export function useSalesmen() {
    return useQuery(salesmenQueryOptions())
}
