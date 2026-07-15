import { useState, useMemo } from "react"
import type { Schemas } from "../../../api/apiClient"

export function useCart(products: Schemas["ProductListResponse"]["items"], stock: Schemas["StockReportResponse"]["items"]) {
    // 1. The Core State (Single Source of Truth)
    // A lightweight dictionary mapping product IDs to their current count in the cart
    const [qty, setQty] = useState<Record<string, number>>({})

    // 2. Derived State: The Cart Items Array
    // We use useMemo so React only recalculates this array when the products or qty actually change
    const cartItems = useMemo(() => {
        return products
            .map((p) => ({ ...p, qty: qty[p.product_id] || 0 }))
            .filter((p) => p.qty > 0)
    }, [products, qty])

    // 3. Derived State: The Total Price
    const total = useMemo(() => {
        return cartItems.reduce((sum, item) => sum + item.qty * Number(item.sell_price), 0)
    }, [cartItems])

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
