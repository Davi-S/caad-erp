import { useState } from "react"
import type { Schemas } from "@/api/apiClient"

export function useCart(products: Schemas["ProductListResponse"]["items"], stock: Record<string, number>) {
    // Core state. Single source of truth. Simplest representation of the cart
    const [cart, setCart] = useState<Record<string, number>>({})

    // Derived states used for clear intent and easy of use of other values 
    const total = products.reduce((sum, item) => sum + (cart[item.product_id] || 0) * Number(item.sell_price), 0)
    const isEmpty = Object.keys(cart).length === 0

    // Actions
    const inc = (id: string) => {
        setCart((prevCart) => {
            const current = prevCart[id] || 0
            const available = stock[id]
            // Prevent adding more than what is available in stock
            if (available !== undefined && current >= available) {
                return prevCart
            }
            return { ...prevCart, [id]: current + 1 }
        })
    }
    const dec = (id: string) => {
        setCart((prevCart) => {
            const current = prevCart[id]
            if (current <= 1) {
                const { [id]: removedItem, ...restOfCart } = prevCart
                return restOfCart
            }
            return { ...prevCart, [id]: current - 1 }
        })
    }
    const clearCart = () => {
        setCart({})
    }

    return {
        cart,
        total,
        isEmpty,
        inc,
        dec,
        clearCart,
    }
}
