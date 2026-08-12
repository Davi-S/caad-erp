import { useState, useEffect, useCallback } from "react"
import { useCart } from "./hooks/useCart"
import { useCheckout } from "./hooks/useCheckout"
import { SalesmanSelectScreen } from "@/components/SalesmanSelectScreen"
import { CartScreen } from "./components/CartScreen"
import { PaymentScreen } from "./components/PaymentScreen"
import { useSalesmen } from "@/hooks/queries/useSalesmen"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"
import { usePOSBroadcast } from "./hooks/usePOSBroadcast"
import type { POSBroadcastState, PaymentDetails } from "./types/broadcast"
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
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null)
    const [openGroupId, setOpenGroupId] = useState<string | null>(null)

    // Instead of passing seven different variables into useEffect, bundle
    // them into a single, cohesive data state object
    const getLatestPOSState = useCallback((): POSBroadcastState => {
        return {
            screen: screen === "payment" ? "payment" : "cart",
            cart: cartState.cart,
            selectedSalesman,
            paymentDetails,
            checkoutStatus: checkoutState.status,
            checkoutError: checkoutState.error,
            total: cartState.total,
            openGroupId,
        }
    }, [
        screen,
        cartState.cart,
        cartState.total,
        selectedSalesman,
        paymentDetails,
        checkoutState.status,
        checkoutState.error,
        openGroupId,
    ])

    const { broadcastState } = usePOSBroadcast("seller", getLatestPOSState)

    useEffect(() => {
        broadcastState(getLatestPOSState())
    }, [getLatestPOSState, broadcastState])

    if (screen === "salesmen") {
        return (
            // This screen does not care about the currently selected salesman.
            // It will always pick a new one. This is why it does not receive a
            // useState like CartScreen.
            <SalesmanSelectScreen
                salesmen={salesmen.filter((s) => s.is_active)}
                title="Quem está vendendo?"
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
                openGroupId={openGroupId}
                onOpenGroupIdChange={setOpenGroupId}
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
                onPaymentStateChange={setPaymentDetails}
                actions={{
                    onConfirm: (method) => {
                        checkoutState.confirmPayment(
                            assemblySalesRequest(selectedSalesmanId, method, cartState, products),
                        )
                    },
                    onNewSale: () => {
                        cartState.clearCart()
                        setPaymentDetails(null)
                        setScreen("cart")
                    },
                    onEdit: () => {
                        // Do not clear the cart
                        setScreen("cart")
                    },
                    onCancel: () => {
                        cartState.clearCart()
                        setPaymentDetails(null)
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
