import { useState } from "react"
import type { Schemas } from "./api/apiClient"

export type CheckoutStatus = "idle" | "confirming" | "confirmed" | "error"

export function useCheckout() {
    const [status, setStatus] = useState<CheckoutStatus>("idle")
    const [error, setError] = useState<string | null>(null)

    const confirmPayment = async (
        cartItems: any[],
        sellerId: string,
        method: Schemas["PaymentType"],
        onUpdateStock: (newStock: Record<string, number>) => void
    ) => {
        // 1. Lock the UI and clear previous errors
        setStatus("confirming")
        setError(null)

        try {
            // 2. Mocking the API communication delay
            // This fakes the time it takes to contact the banking/backend
            // server to confirm the payment
            await new Promise((resolve) => setTimeout(resolve, 1500))

            // --- FUTURE API IMPLEMENTATION GOES HERE ---
            // const payload = {
            //     salesman_id: sellerId,
            //     payment_method: method,
            //     items: cartItems.map(item => ({ id: item.id, quantity: item.qty }))
            // }
            // const response = await apiClient.post("/sales", payload)
            // onUpdateStock(response.updatedStock)
            // -------------------------------------------

            // 3. Transition to the success state
            setStatus("confirmed")

        } catch (err) {
            // 4. Handle failure gracefully
            setStatus("error")
            setError("Falha ao registrar a venda. Por favor, tente novamente.")
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
