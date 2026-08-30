import { useState } from "react"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"

export interface CartItem {
    productId: string
    name: string
    unitPrice: number // in cents
    quantity: number
    discount: number // in cents
}

export function useCart() {
    const { data: products } = useProducts()
    const { data: stock } = useStock()

    // Core unified state. Single source of truth.
    const [items, setItems] = useState<Record<string, CartItem>>({})
    const [discount, setDiscountState] = useState<number>(0)
    const [notes, setNotes] = useState<string>("")

    const itemsList = Object.values(items)

    // Derived states
    const subtotal = itemsList.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const totalItemDiscount = itemsList.reduce((sum, item) => sum + item.discount, 0)
    const netSubtotal = subtotal - totalItemDiscount
    const total = netSubtotal - discount
    const isEmpty = itemsList.length === 0

    // Actions
    const inc = (id: string) => {
        const product = products?.find((p) => p.id === id)
        if (!product) return

        setItems((prevItems) => {
            const currentItem = prevItems[id]
            const currentQty = currentItem?.quantity || 0
            const available = stock?.[id]

            // Prevent adding more than what is available in stock
            if (available !== undefined && currentQty >= available) {
                return prevItems
            }

            // Remove global discount when cart changes
            setDiscountState(0)

            return {
                ...prevItems,
                [id]: {
                    productId: id,
                    name: product.name,
                    unitPrice: product.sellPrice,
                    quantity: currentQty + 1,
                    discount: 0, // Reset discount on quantity change
                },
            }
        })
    }

    const dec = (id: string) => {
        setItems((prevItems) => {
            const currentItem = prevItems[id]
            if (!currentItem) return prevItems

            // Remove global discount when cart changes
            setDiscountState(0)

            if (currentItem.quantity <= 1) {
                const { [id]: _, ...rest } = prevItems
                return rest
            }

            return {
                ...prevItems,
                [id]: {
                    ...currentItem,
                    quantity: currentItem.quantity - 1,
                    discount: 0, // Reset discount on quantity change
                },
            }
        })
    }

    const removeItem = (id: string) => {
        setItems((prevItems) => {
            if (!prevItems[id]) return prevItems
            const { [id]: _, ...rest } = prevItems
            setDiscountState(0)
            return rest
        })
    }

    const setItemDiscount = (id: string, value: number) => {
        setItems((prevItems) => {
            const currentItem = prevItems[id]
            if (!currentItem) return prevItems

            const itemGross = currentItem.quantity * currentItem.unitPrice
            const clampedDiscount = Math.min(itemGross, Math.max(0, value))

            return {
                ...prevItems,
                [id]: {
                    ...currentItem,
                    discount: clampedDiscount,
                },
            }
        })
        setDiscountState(0)
    }

    const clearItemDiscount = (id: string) => {
        setItems((prevItems) => {
            const currentItem = prevItems[id]
            if (!currentItem) return prevItems

            return {
                ...prevItems,
                [id]: {
                    ...currentItem,
                    discount: 0,
                },
            }
        })
        setDiscountState(0)
    }

    const setDiscount = (value: number) => {
        setDiscountState(Math.min(netSubtotal, Math.max(0, value)))
    }

    const clearCart = () => {
        setItems({})
        setDiscountState(0)
    }

    const clearDiscount = () => {
        setDiscountState(0)
    }

    const clearAllDiscounts = () => {
        setItems((prevItems) => {
            const updated: Record<string, CartItem> = {}
            for (const [id, item] of Object.entries(prevItems)) {
                updated[id] = { ...item, discount: 0 }
            }
            return updated
        })
        setDiscountState(0)
    }

    const clearNotes = () => {
        setNotes("")
    }

    return {
        items,
        itemsList,
        subtotal,
        totalItemDiscount,
        netSubtotal,
        discount,
        total,
        notes,
        isEmpty,
        inc,
        dec,
        setItemDiscount,
        clearItemDiscount,
        setDiscount,
        clearDiscount,
        clearAllDiscounts,
        clearCart,
        setNotes,
        clearNotes,
        removeItem,
    }
}
