import { useState } from "react"
import { useCart } from "./useCart"
import { useCheckout } from "./useCheckout"
import { SellerScreen } from "./screens/SellerScreen"
import { CartScreen } from "./screens/CartScreen"
import { PixScreen } from "./screens/PixScreen"
import type { Schemas } from "../api/apiClient"

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
    const selectedSeller = sellers.find((s) => s.id === selectedSellerId) || null

    // Hooks
    // TODO: Move these hooks into the CartScreen file
    const { qty, setQty, cartItems, total, clearCart } = useCart(products, stock)
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
                products={products}
                stock={stock}
                onBack={() => setScreen("seller")}
                onClose={() => {
                    resetCheckout()
                    setScreen("pix")
                }}
            />
        )
    }

    if (screen === "pix") {
        return (
            <PixScreen
                total={total}
                status={status}
                error={error}
                onConfirm={() => {
                    if (selectedSellerId) {
                        confirmPayment(cartItems, selectedSellerId, onUpdateStock)
                    }
                }}
                onNewSale={() => {
                    clearCart()
                    setScreen("cart")
                }}
            />
        )
    }

    return null
}
