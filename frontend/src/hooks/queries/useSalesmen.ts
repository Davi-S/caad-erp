import type { Salesmen } from "@/types"
import { useQuery } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"

export const salesmenQueryOptions = () => ({
    queryKey: ["salesmen"],
    queryFn: async (): Promise<Salesmen> => {
        const list = await trpcClient.salesmen.list.query()
        return list.map((s) => ({
            salesman_id: s.salesmanId,
            salesman_name: s.salesmanName,
            is_active: s.isActive,
        }))
    },
})

export function useSalesmen() {
    return useQuery(salesmenQueryOptions())
}
