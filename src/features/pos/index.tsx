import { useState } from "react"
import { useCart } from "./hooks/useCart"
import { useCheckout } from "./hooks/useCheckout"
import { SellerScreen } from "./components/SellerScreen"
import { CartScreen } from "./components/CartScreen"
import { PaymentScreen } from "./components/PaymentScreen"
import type { Schemas } from "@/api/apiClient"

// Define the props expected by the POS feature
interface POSFlowProps {
    products: Schemas["ProductListResponse"]["items"]
    stock: Record<string, number>
    sellers: Schemas["SalesmanListResponse"]["items"]
    onUpdateStock: (newStock: Record<string, number>) => void
}

export function POSFlow({
    products,
    stock,
    sellers,
    onUpdateStock,
}: POSFlowProps) {
    // Local routing state for the checkout sequence
    const [screen, setScreen] = useState<"seller" | "cart" | "payment">("seller")
    const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)
    const selectedSeller = sellers.find((s) => s.salesman_id === selectedSellerId) || null

    // Hooks
    const cartState = useCart(products, stock)
    const { status, error, confirmPayment, resetCheckout } = useCheckout()

    if (screen === "seller") {
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
                seller={selectedSeller}
                catalog={{ products, stock }}
                cart={cartState} // Passes the entire hook result at once
                actions={{
                    onBack: () => setScreen("seller"),
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
                        if (selectedSellerId) {
                            confirmPayment(cartState.cartItems, selectedSellerId, method, onUpdateStock)
                        }
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
                        setScreen("seller")
                    }
                }}
            />
        )
    }

    return null
}
