import type { Salesman } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"

export const salesmenQueryOptions = () => ({
    queryKey: ["salesmen"],
    queryFn: async (): Promise<Salesman[]> => {
        return trpcClient.salesmen.list.query()
    },
})

export function useSalesmen() {
    return useQuery(salesmenQueryOptions())
}
