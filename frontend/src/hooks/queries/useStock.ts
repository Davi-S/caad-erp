import type { Stock } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"

export const stockQueryOptions = () => ({
    queryKey: ["stock"],
    queryFn: async (): Promise<Stock> => {
        return trpcClient.reports.inventory.query()
    },
})

export function useStock() {
    return useQuery(stockQueryOptions())
}
