import { useState } from "react"
import { useCart } from "./hooks/useCart"
import { useCheckout } from "./hooks/useCheckout"
import { SalesmanSelectScreen } from "@/components/SalesmanSelectScreen"
import { CartScreen } from "./components/CartScreen"
import { PaymentScreen } from "./components/PaymentScreen"
import { useSalesmen } from "@/hooks/queries/useSalesmen"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"
import type { PaymentType, Products } from "@/types"

export function POSFlow() {
    // Get the API data from the queries
    const { data: salesmen } = useSalesmen()
    const { data: products } = useProducts()
    const { data: stock } = useStock()

    // Local routing state for the checkout sequence
    const [screen, setScreen] = useState<"salesmen" | "cart" | "payment">("salesmen")

    const [selectedSalesmanId, setSelectedSalesmanId] = useState<string | null>(null)
    const selectedSalesman = salesmen.find((s) => s.salesman_id === selectedSalesmanId) || null

    // Hooks
    const cartState = useCart()
    const checkoutState = useCheckout()

    if (screen === "salesmen") {
        return (
            // This screen does not care about the currently selected salesman.
            // It will always pick a new one. This is why it does not receive a
            // useState like CartScreen.
            <SalesmanSelectScreen
                salesmen={salesmen.filter((s) => s.is_active)}
                title="Quem tá vendendo hoje?"
                confirmLabel="Começar venda"
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
                products={products.filter((p) => p.is_active)}
                stock={stock}
                cartState={cartState}
                actions={{
                    onBack: () => setScreen("salesmen"),
                    onNext: () => setScreen("payment"),
                }}
            />
        )
    }

    if (screen === "payment") {
        return (
            <PaymentScreen
                salesman={selectedSalesman}
                cartState={cartState}
                checkoutState={checkoutState}
                actions={{
                    onConfirm: (method) => {
                        checkoutState.confirmPayment(
                            assemblySalesRequest(selectedSalesmanId, method, cartState, products),
                        )
                    },
                    onNewSale: () => {
                        cartState.clearCart()
                        setScreen("salesmen")
                    },
                    onEdit: () => {
                        // Do not clear the cart
                        setScreen("cart")
                    },
                    onCancel: () => {
                        cartState.clearCart()
                        setScreen("salesmen")
                    },
                }}
            />
        )
    }

    return null
}

function assemblySalesRequest(
    selectedSalesmanId: string,
    method: PaymentType,
    cartState: ReturnType<typeof useCart>,
    products: Products,
) {
    return cartState.cartIterable.map(([productId, quantity]) => {
        const productPrice = products.find((p) => p.product_id === productId).sell_price
        return {
            product_id: productId,
            salesman_id: selectedSalesmanId,
            quantity: quantity,
            total_revenue: quantity * productPrice,
            payment_type: method,
            notes: null,
        }
    })
}
