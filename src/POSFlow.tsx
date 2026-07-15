import { useState } from "react"
import { useCart } from "./useCart"
import { useCheckout } from "./useCheckout"
import { SellerScreen } from "./screens/SellerScreen"
import { CartScreen } from "./screens/CartScreen"
import { PixScreen } from "./screens/PixScreen"
import type { Schemas } from "./api/apiClient"

// Define the props expected by the POS feature
interface POSFlowProps {
    products: Schemas["ProductListResponse"]["items"]
    stock: Schemas["StockReportResponse"]["items"]
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
    const [screen, setScreen] = useState<"seller" | "cart" | "pix">("seller")
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
                        setScreen("pix")
                    }
                }}
            />
        )
    }

    if (screen === "pix") {
        return (
            <PixScreen
                total={cartState.total}
                status={status}
                error={error}
                onConfirm={() => {
                    if (selectedSellerId) {
                        confirmPayment(cartState.cartItems, selectedSellerId, onUpdateStock)
                    }
                }}
                onNewSale={() => {
                    cartState.clearCart()
                    setScreen("cart")
                }}
            />
        )
    }

    return null
}
