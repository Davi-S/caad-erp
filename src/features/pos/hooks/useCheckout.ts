import { useState } from "react"
import type { SalesRequests } from "@/App"
import { api } from "@/api/apiClient"

export type CheckoutStatus = "idle" | "confirming" | "confirmed" | "error"

export function useCheckout() {
    const [status, setStatus] = useState<CheckoutStatus>("idle")
    const [error, setError] = useState<string | null>(null)

    const confirmPayment = async (
        salesRequests: SalesRequests,
        onUpdateStock: (newStock: Record<string, number>) => void
    ) => {
        setStatus("confirming")
        setError(null)

        // TODO: Update this when the api updates to accept multiple products
        // per sale.
        try {
            for (const saleRequest of salesRequests) {
                await api.POST("/transactions/sale", { body: saleRequest })
            }

            // Ask the API for the fresh inventory numbers
            const freshStockResponse = await api.GET("/reports/stock")
            // Transform the array into a dictionary just like App.tsx does
            const stockMap: Record<string, number> = {}
            const items = freshStockResponse.data["items"]
            for (const item of items) {
                stockMap[item.product_id] = item.quantity
            }
            onUpdateStock(stockMap)

            setStatus("confirmed")
        } catch (err) {
            setStatus("error")
            setError("Falha ao registrar a venda.")
        }
    }

    const resetCheckout = () => {
        setStatus("idle")
        setError(null)
    }

    return {
        status,
        error,
        confirmPayment,
        resetCheckout
    }
}
