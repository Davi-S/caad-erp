import { useState } from "react"
import type { Schemas } from "@/api/apiClient"

export function useCart(products: Schemas["ProductListResponse"]["items"], stock: Record<string, number>) {
    // Core state. Single source of truth
    const [qty, setQty] = useState<Record<string, number>>({})

    // Derived states
    const cartItems = products.map((p) => ({ ...p, qty: qty[p.product_id] || 0 })).filter((p) => p.qty > 0)
    const total = cartItems.reduce((sum, item) => sum + item.qty * Number(item.sell_price), 0)

    // 4. Actions
    const inc = (id: string) => {
        setQty((prevQty) => {
            const current = prevQty[id] || 0
            const available = stock[id]

            // Guard clause: Prevent adding more than what is available in stock
            if (available !== undefined && current >= available) {
                return prevQty
            }

            return { ...prevQty, [id]: current + 1 }
        })
    }

    const dec = (id: string) => {
        setQty((prevQty) => {
            const current = prevQty[id] || 0
            const nextCount = Math.max(0, current - 1)

            return { ...prevQty, [id]: nextCount }
        })
    }

    const clearCart = () => {
        setQty({})
    }

    // 5. The Output
    return {
        qty,
        cartItems,
        total,
        inc,
        dec,
        clearCart,
    }
}
