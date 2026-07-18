import { useState } from "react"
import { useCart } from "./hooks/useCart"
import { useCheckout } from "./hooks/useCheckout"
import { SalesmenScreen } from "./components/SalesmenScreen"
import { CartScreen } from "./components/CartScreen"
import { PaymentScreen } from "./components/PaymentScreen"
import { useSalesmen } from "@/hooks/queries/useSalesmen"
import { useProducts } from "@/hooks/queries/useProducts"

export function POSFlow() {
    // Get the API data from the queries
    const { data: salesmen } = useSalesmen()
    const { data: products } = useProducts()

    // Local routing state for the checkout sequence
    const [screen, setScreen] = useState<"salesmen" | "cart" | "payment">("salesmen")
    const [selectedSalesmanId, setSelectedSalesmanId] = useState<string | null>(null)
    const selectedSalesman = salesmen.find((s) => s.salesman_id === selectedSalesmanId) || null

    // Hooks
    const cartState = useCart()
    const { status, error, confirmPayment, resetCheckout } = useCheckout()

    if (screen === "salesmen") {
        return (
            <SalesmenScreen
                // Will return the selected salesman's id
                onNext={(id) => {
                    setSelectedSalesmanId(id)
                    setScreen("cart")
                }}
            />
        )
    }

    if (screen === "cart") {
        return (
            <CartScreen
                salesman={selectedSalesman}
                cartState={cartState} // Passes the entire hook result at once
                actions={{
                    onBack: () => setScreen("salesmen"),
                    onNext: () => {
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
                                salesman_id: selectedSalesmanId,
                                quantity: quantity,
                                total_revenue: quantity * productPrice,
                                payment_type: method,
                                notes: null
                            }
                        })
                        confirmPayment(salesRequests)
                    },
                    onNewSale: () => {
                        cartState.clearCart()
                        resetCheckout()
                        setScreen("salesmen")
                    },
                    onEdit: () => {
                        // Simply send them back to the cart. 
                        setScreen("cart")
                    },
                    onCancel: () => {
                        cartState.clearCart()
                        resetCheckout()
                        setScreen("salesmen")
                    }
                }}
            />
        )
    }

    return null
}
