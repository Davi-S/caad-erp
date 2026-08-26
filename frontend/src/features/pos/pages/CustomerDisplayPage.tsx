import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"
import { usePOSBroadcast } from "../hooks/usePOSBroadcast"
import { CustomerCartScreen } from "../components/customer/CustomerCartScreen"
import { CustomerPaymentScreen } from "../components/customer/CustomerPaymentScreen"

export function CustomerDisplayPage() {
    const { data: products = [] } = useProducts()
    const { data: stock = {} } = useStock()
    const { syncedState } = usePOSBroadcast("client")

    const cart = syncedState?.cart || {}
    const total = syncedState?.total || 0
    const subtotal = syncedState?.subtotal || 0
    const discount = syncedState?.discount || 0
    const activeScreen = syncedState?.screen || "cart"
    const paymentDetails = syncedState?.paymentDetails || null

    if (activeScreen === "payment") {
        return (
            <CustomerPaymentScreen
                total={total}
                subtotal={subtotal}
                discount={discount}
                paymentDetails={paymentDetails}
                checkoutStatus={syncedState?.checkoutStatus || "idle"}
            />
        )
    }

    return (
        <CustomerCartScreen
            products={products.filter((p) => p.isActive)}
            stock={stock}
            cart={cart}
            total={total}
            subtotal={subtotal}
            discount={discount}
            openGroupId={syncedState?.openGroupId || null}
        />
    )
}
