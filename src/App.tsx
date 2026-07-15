import { useEffect, useState } from "react"
import { api } from "./api/apiClient"
import { StatusScreen } from "./components/StatusScreen"
import { POSFlow } from "./features/pos/"
import type { Schemas } from "./api/apiClient"

export default function App() {
    const [initStatus, setInitStatus] = useState("loading") // loading | ready | error
    const [initError, setInitError] = useState("")

    const [products, setProducts] = useState<Schemas["ProductListResponse"]["items"]>([])
    const [sellers, setSellers] = useState<Schemas["SalesmanListResponse"]["items"]>([])
    const [stock, setStock] = useState<Record<string, number>>({})

    async function loadAll() {
        setInitStatus("loading")
        setInitError("")

        const [productsRes, salesmenRes, stockRes] = await Promise.all([
            api.GET("/products"),
            api.GET("/salesmen"),
            api.GET("/reports/stock"),
        ])

        if (productsRes.error || salesmenRes.error || stockRes.error) {
            setInitError(String({
                productsError: productsRes.error,
                salesmenError: salesmenRes.error,
                stockError: stockRes.error,
            }))
            setInitStatus("error")
            return
        }

        setProducts(productsRes.data["items"])
        setSellers(salesmenRes.data["items"])
        // Build the dictionary mapping for O(1) lookups
        const stockMap: Record<string, number> = {}
        const stockItems = stockRes.data["items"]
        for (const item of stockItems) {
            stockMap[item.product_id] = Number(item.quantity)
        }
        setStock(stockMap)

        setInitStatus("ready")
    }

    useEffect(() => {
        loadAll()
    }, [])

    return (
        <div
            className="w-full min-h-svh font-body bg-paper bg-[radial-gradient(circle,var(--color-paperLine)_1px,transparent_1px)] bg-size[18px_18px]"
        >
            {initStatus === "loading" && <StatusScreen mode="loading" />}

            {initStatus === "error" && (
                <StatusScreen mode="error" message={initError} onRetry={loadAll} />
            )}

            {initStatus === "ready" && (
                <POSFlow
                    products={products}
                    sellers={sellers}
                    stock={stock}
                    onUpdateStock={setStock}
                />
            )}
        </div>
    )
}
