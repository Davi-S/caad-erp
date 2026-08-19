import type { SalesmanCreateRequest, SalesmanUpdateRequest } from "@/types"
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

export function useCreateSalesman() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: SalesmanCreateRequest) => {
            try {
                const salesman = await trpcClient.salesmen.add.mutate({
                    salesmanId: input.salesman_id,
                    salesmanName: input.salesman_name,
                    isActive: input.is_active,
                })
                return {
                    salesman_id: salesman.salesmanId,
                    salesman_name: salesman.salesmanName,
                    is_active: salesman.isActive,
                }
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao criar vendedor."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["salesmen"] })
        },
    })
}

export function useUpdateSalesman() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            salesmanId,
            input,
        }: {
            salesmanId: string
            input: SalesmanUpdateRequest
        }) => {
            try {
                const salesman = await trpcClient.salesmen.update.mutate({
                    salesmanId,
                    data: {
                        salesmanName: input.salesman_name,
                        isActive: input.is_active,
                    },
                })
                return {
                    salesman_id: salesman.salesmanId,
                    salesman_name: salesman.salesmanName,
                    is_active: salesman.isActive,
                }
            } catch (err) {
                throw new Error(extractErrorMessage(err, "Falha ao atualizar vendedor."))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["salesmen"] })
        },
    })
}
