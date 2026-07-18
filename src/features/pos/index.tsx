import { useState } from "react"
import { useCart } from "./hooks/useCart"
import { useCheckout } from "./hooks/useCheckout"
import { SellerScreen } from "./components/SellerScreen"
import { CartScreen } from "./components/CartScreen"
import { PaymentScreen } from "./components/PaymentScreen"
import type { Products, Salesmen, Stock } from "@/App"

interface POSFlowProps {
    products: Products
    selesmen: Salesmen
    stock: Stock
    onUpdateStock: (newStock: Stock) => void
}

export function POSFlow({
    products,
    selesmen: sellers,
    stock,
    onUpdateStock,
}: POSFlowProps) {
    // Local routing state for the checkout sequence
    const [screen, setScreen] = useState<"selesmen" | "cart" | "payment">("selesmen")
    const [selectedSelesmanId, setSelectedSellerId] = useState<string | null>(null)
    const selectedSeller = sellers.find((s) => s.salesman_id === selectedSelesmanId) || null

    // Hooks
    const cartState = useCart(products, stock)
    const { status, error, confirmPayment, resetCheckout } = useCheckout()

    if (screen === "selesmen") {
        return (
            <SellerScreen
                sellers={sellers}
                // SellerScreen will return the selected seller's id
                onNext={(id) => { setSelectedSellerId(id); setScreen("cart") }}
            />
        )
    }

    if (screen === "cart") {
        return (
            <CartScreen
                selesman={selectedSeller}
                catalog={{ products, stock }}
                cartState={cartState} // Passes the entire hook result at once
                actions={{
                    onBack: () => setScreen("selesmen"),
                    onClose: () => {
                        resetCheckout()
                        setScreen("payment")
                    }
                }}
            />
        )
    }

    if (screen === "payment") {
        return (
            <PaymentScreen
                total={cartState.total}
                checkout={{ status, error }}
                actions={{
                    onConfirm: (method) => {
                        const salesRequests = cartState.cartIterable.map(([productId, quantity]) => {
                            const productPrice = products.find(p => p.product_id === productId).sell_price
                            return {
                                product_id: productId,
                                salesman_id: selectedSelesmanId,
                                quantity: quantity,
                                total_revenue: quantity * productPrice,
                                payment_type: method,
                                notes: null
                            }
                        })
                        confirmPayment(salesRequests, onUpdateStock)
                    },
                    onNewSale: () => {
                        cartState.clearCart()
                        resetCheckout()
                        // Currently keeping the same seller. But in the future,
                        // may be better to force the users to always select a
                        // seller to prevent a new sell with the previous
                        // seller's name
                        setScreen("cart")
                    },
                    onEdit: () => {
                        // Simply send them back to the cart. 
                        setScreen("cart")
                    },
                    onCancel: () => {
                        cartState.clearCart()
                        resetCheckout()
                        setScreen("selesmen")
                    }
                }}
            />
        )
    }

    return null
}
