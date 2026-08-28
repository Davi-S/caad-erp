import { useState } from "react"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"

export function useCart() {
    // Get the "catalog"
    const { data: products } = useProducts()
    const { data: stock } = useStock()

    // Core state. Single source of truth. Simplest representation of the cart
    const [cart, setCart] = useState<Record<string, number>>({})
    const [discount, setDiscountState] = useState<number>(0)
    const [notes, setNotes] = useState<string>("")

    // Derived states used for clear intent and easy of use of other values
    const subtotal = (products ?? []).reduce(
        (sum, item) => sum + (cart[item.id] || 0) * item.sellPrice,
        0,
    )
    const isEmpty = Object.keys(cart).length === 0
    const total = subtotal - discount

    const cartIterable = Object.entries(cart)

    // Actions
    const inc = (id: string) => {
        setCart((prevCart) => {
            const current = prevCart[id] || 0
            const available = stock?.[id]
            // Prevent adding more than what is available in stock
            if (available !== undefined && current >= available) {
                return prevCart
            }
            setDiscountState(0)
            return { ...prevCart, [id]: current + 1 }
        })
    }
    const dec = (id: string) => {
        setCart((prevCart) => {
            const current = prevCart[id]
            setDiscountState(0)
            if (current <= 1) {
                const { [id]: _, ...restOfCart } = prevCart
                return restOfCart
            }
            return { ...prevCart, [id]: current - 1 }
        })
    }
    const setDiscount = (value: number) => {
        setDiscountState(Math.min(subtotal, Math.max(0, value)))
    }
    const clearCart = () => {
        setCart({})
        setDiscountState(0)
    }
    const clearDiscount = () => {
        setDiscountState(0)
    }
    const clearNotes = () => {
        setNotes("")
    }
    const removeItem = (id: string) => {
        setCart((prevCart) => {
            const { [id]: _, ...restOfCart } = prevCart
            setDiscountState(0)
            return restOfCart
        })
    }

    return {
        cart,
        cartIterable,
        subtotal,
        discount,
        total,
        notes,
        isEmpty,
        inc,
        dec,
        setDiscount,
        clearDiscount,
        clearCart,
        setNotes,
        clearNotes,
        removeItem,
    }
}
