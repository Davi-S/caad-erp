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
import { distributeDiscount } from "./utils/discount"
import { brl } from "@/helpers"
import type { POSBroadcastState, PaymentDetails } from "./types/broadcast"
import type { PaymentType, Product } from "@/types"

export function POSFlow() {
    // Get the API data from the queries
    const { data: salesmen = [] } = useSalesmen()
    const { data: products = [] } = useProducts()
    const { data: stock = {} } = useStock()

    // Local routing state for the checkout sequence
    const [screen, setScreen] = useState<"salesmen" | "cart" | "payment">("salesmen")

    const [selectedSalesmanId, setSelectedSalesmanId] = useState<string | null>(null)
    const selectedSalesman = salesmen.find((s) => s.id === selectedSalesmanId) || null

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
            subtotal: cartState.subtotal,
            discount: cartState.discount,
            total: cartState.total,
            openGroupId,
        }
    }, [
        screen,
        cartState.cart,
        cartState.subtotal,
        cartState.discount,
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
                salesmen={salesmen.filter((s) => s.isActive)}
                title="Quem está vendendo?"
                confirmLabel="Começar venda"
                onNext={(id) => {
                    setSelectedSalesmanId(id)
                    // Clear cart notes after changing the salesman
                    cartState.clearNotes()
                    setScreen("cart")
                }}
            />
        )
    }

    if (screen === "cart") {
        return (
            <CartScreen
                salesman={selectedSalesman}
                products={products.filter((p) => p.isActive)}
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
                        cartState.clearNotes()
                        checkoutState.resetCheckout()
                        setPaymentDetails(null)
                        setScreen("cart")
                    },
                    onEdit: () => {
                        // Do not clear the cart
                        setScreen("cart")
                    },
                    onCancel: () => {
                        cartState.clearCart()
                        cartState.clearNotes()
                        checkoutState.resetCheckout()
                        setPaymentDetails(null)
                        setScreen("salesmen")
                    },
                }}
            />
        )
    }

    return null
}

export function assemblySalesRequest(
    selectedSalesmanId: string | null,
    method: PaymentType,
    cartState: ReturnType<typeof useCart>,
    products: Product[],
) {
    const lineItems = cartState.cartIterable.map(([productId, quantity]) => {
        const productPrice = products.find((p) => p.id === productId)?.sellPrice ?? 0
        return {
            productId,
            subtotal: quantity * productPrice,
        }
    })

    const distributedDiscounts = distributeDiscount(lineItems, cartState.discount)

    return cartState.cartIterable.map(([productId, quantity]) => {
        const productPrice = products.find((p) => p.id === productId)?.sellPrice ?? 0
        const itemSubtotal = quantity * productPrice
        const itemDiscount = distributedDiscounts[productId] || 0
        const itemRevenue = itemSubtotal - itemDiscount

        const notes = formatSaleNotes(cartState.notes, cartState.discount, itemDiscount)

        return {
            productId: productId,
            salesmanId: selectedSalesmanId,
            quantity: quantity,
            totalRevenue: method === "OnCredit" ? 0 : itemRevenue,
            paymentType: method,
            notes,
        }
    })
}

export function formatSaleNotes(
    manualNotes: string,
    discountCents: number,
    itemDiscountCents: number,
): string | null {
    const manual = manualNotes.trim()
    let discountNote: string | null = null
    if (discountCents > 0) {
        discountNote = `Desconto global de ${brl(discountCents)} aplicado (Desc. proporcional do item: ${brl(itemDiscountCents)})`
    }

    if (manual && discountNote) {
        return `${manual} • ${discountNote}`
    }
    return manual || discountNote || null
}
