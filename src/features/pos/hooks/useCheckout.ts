import { useState } from "react"
import type { Schemas } from "../../../api/apiClient"
import { api } from "../../../api/apiClient"

export type CheckoutStatus = "idle" | "confirming" | "confirmed" | "error"

export function useCheckout() {
    const [status, setStatus] = useState<CheckoutStatus>("idle")
    const [error, setError] = useState<string | null>(null)

    const confirmPayment = async (
        cartItems: any[],
        sellerId: string,
        method: Schemas["PaymentType"],
        onUpdateStock: (newStock: Schemas["StockReportResponse"]["items"]) => void
    ) => {
        setStatus("confirming")
        setError(null)

        // TODO: Update this when the api updates to accept multiple products
        // per sale.
        try {
            for (const item of cartItems) {
                const payload = {
                    product_id: item.id,
                    salesman_id: sellerId,
                    quantity: item.qty,
                    total_revenue: item.qty * item.price,
                    payment_type: method,
                    notes: null
                }
                // The loop pauses here until the server responds for THIS item
                await api.POST("/transactions/sale", { body: payload })
            }

            // 2. Ask the API for the fresh inventory numbers
            // (Replace this with your actual GET endpoint)
            const freshStockResponse = await api.GET("/reports/stock")

            // 3. Send the real database numbers to the React state
            onUpdateStock(freshStockResponse["items"])

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
