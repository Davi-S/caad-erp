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
import type { PaymentType } from "@/types"

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
            items: cartState.items,
            selectedSalesman,
            paymentDetails,
            checkoutStatus: checkoutState.status,
            checkoutError: checkoutState.error,
            subtotal: cartState.subtotal,
            totalItemDiscount: cartState.totalItemDiscount,
            discount: cartState.discount,
            total: cartState.total,
            openGroupId,
        }
    }, [
        screen,
        cartState.items,
        cartState.subtotal,
        cartState.totalItemDiscount,
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
                            assemblySalesRequest(selectedSalesmanId, method, cartState),
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
    selectedSalesmanId: string,
    method: PaymentType,
    cartState: Pick<ReturnType<typeof useCart>, "itemsList" | "discount" | "notes">,
) {
    const lineItems = cartState.itemsList.map((item) => {
        const itemGrossSubtotal = item.quantity * item.unitPrice
        const itemSpecificDiscount = item.discount || 0
        const itemNetSubtotal = itemGrossSubtotal - itemSpecificDiscount
        return {
            productId: item.productId,
            subtotal: itemNetSubtotal,
        }
    })

    const distributedGlobalDiscounts = distributeDiscount(lineItems, cartState.discount)

    return cartState.itemsList.map((item) => {
        const itemGrossSubtotal = item.quantity * item.unitPrice
        const itemSpecificDiscount = item.discount || 0
        const allocatedGlobalDiscount = distributedGlobalDiscounts[item.productId] || 0
        const totalDiscountOnItem = itemSpecificDiscount + allocatedGlobalDiscount
        const itemRevenue = itemGrossSubtotal - totalDiscountOnItem

        const notes = formatSaleNotes(
            cartState.notes,
            cartState.discount,
            allocatedGlobalDiscount,
            itemSpecificDiscount,
        )

        const totalRevenue = method === "OnCredit" ? 0 : itemRevenue
        const paymentType: PaymentType =
            method === "OnCredit" ? "OnCredit" : itemRevenue === 0 ? "Other" : method

        return {
            productId: item.productId,
            salesmanId: selectedSalesmanId,
            quantity: item.quantity,
            totalRevenue,
            paymentType,
            notes,
        }
    })
}

export function formatSaleNotes(
    manualNotes: string,
    globalDiscountCents: number,
    allocatedGlobalDiscountCents: number,
    itemDiscountCents: number = 0,
): string | null {
    const parts: string[] = []

    if (itemDiscountCents > 0) {
        parts.push(`Desconto no item de ${brl(itemDiscountCents)}`)
    }

    if (globalDiscountCents > 0) {
        parts.push(
            `Desconto global de ${brl(globalDiscountCents)} aplicado (Desc. proporcional do item: ${brl(allocatedGlobalDiscountCents)})`,
        )
    }

    const manual = manualNotes.trim()
    if (manual) {
        parts.push(manual)
    }

    return parts.length > 0 ? parts.join(" | ") : null
}
