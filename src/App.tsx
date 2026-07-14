import { useEffect, useState } from "react"
import { api } from "./api/apiClient"
import { slugify } from "./helpers"
import { StatusScreen } from "./components/StatusScreen"
import { SellerScreen } from "./screens/SellerScreen"
import { PixScreen } from "./screens/PixScreen"
import { CartScreen } from "./screens/CartScreen"

export default function App() {
    const [screen, setScreen] = useState("seller") // seller | cart | pix

    // ---- Data loaded from the CAAD-ERP API ----
    const [initStatus, setInitStatus] = useState("loading") // loading | ready | error
    const [initError, setInitError] = useState("")
    const [products, setProducts] = useState([]) // [{id, name, price, emoji}]
    const [sellers, setSellers] = useState([]) // [{id, name}]
    const [stock, setStock] = useState({}) // { [productId]: quantity }

    const [selectedSellerId, setSelectedSellerId] = useState(null)
    const [creatingSeller, setCreatingSeller] = useState(false)

    const [qty, setQty] = useState({})
    const [pixStatus, setPixStatus] = useState("waiting") // waiting | confirming | confirmed
    const [pixError, setPixError] = useState("")

    async function loadAll() {
        setInitStatus("loading")
        setInitError("")

        // Fetch everything concurrently
        const [productsRes, salesmenRes, stockRes] = await Promise.all([
            api.GET("/products"),
            api.GET("/salesmen"),
            api.GET("/reports/stock"),
        ])

        // Check if ANY of the requests failed
        if (productsRes.error || salesmenRes.error || stockRes.error) {
            setInitError(String({
                productsError: productsRes.error,
                salesmenError: salesmenRes.error,
                stockError: stockRes.error,
            }))
            setInitStatus("error")
            // Stop execution because the UI cannot function without this data
            return
        }

        // If we pass the error check, TypeScript guarantees 'data' exists for all of them
        const products = productsRes.data
        const salesmen = salesmenRes.data
        const stock = stockRes.data

        setProducts(
            (products?.items || []).map((p) => ({
                id: p.product_id,
                name: p.product_name,
                price: parseFloat(p.sell_price),
                emoji: "🧺",
            }))
        )
        setSellers(
            (salesmen.items || []).map((s) => ({
                id: s.salesman_id,
                name: s.salesman_name,
            }))
        )
        const stockMap = {};
        (stock?.items || []).forEach((i) => {
            stockMap[i.product_id] = parseFloat(i.quantity)
        })
        setStock(stockMap)

        setInitStatus("ready")
    }

    useEffect(() => {
        loadAll()
    }, [])

    async function handleCreateSeller() {
        const name = window.prompt("Nome do novo vendedor:")
        if (!name || !name.trim()) return
        const trimmed = name.trim()
        const id = `${slugify(trimmed)}-${Date.now().toString(36).slice(-4)}`
        setCreatingSeller(true)
        try {
            // Call the endpoint directly with the correct body payload
            const { data, error } = await api.POST("/salesmen", {
                body: {
                    salesman_id: id,
                    salesman_name: trimmed,
                    is_active: true // Optional, but good practice since it's in the schema
                }
            })

            // 2. Handle HTTP Errors (e.g., 400 Validation Error, 409 Conflict)
            if (error) {
                let errorMsg = "Erro desconhecido"

                // Extract the FastAPI error detail just like your old wrapper did
                if (error.detail) {
                    if (typeof error.detail === "string") {
                        errorMsg = error.detail
                    } else if (Array.isArray(error.detail)) {
                        errorMsg = error.detail.map((d: any) => d.msg).join("; ")
                    }
                }

                window.alert(`Não foi possível cadastrar o vendedor: ${errorMsg}`)
                return // Stop execution so we don't update the UI state
            }

            // 3. Success Path: data is guaranteed to be StandardResponse here
            setSellers((prev) => [...prev, { id, name: trimmed }])
            setSelectedSellerId(id)

        } catch (err) {
            // 4. Handle Network Crashes (e.g., server offline, no internet)
            // This catch block now ONLY fires if the fetch() fails completely, not for HTTP errors.
            window.alert("Erro de conexão. Verifique se o servidor está rodando na rede local.")
            console.error(err)
        } finally {
            setCreatingSeller(false)
        }
    }

    const selectedSeller = sellers.find((s) => s.id === selectedSellerId) || null
    const productById = Object.fromEntries(products.map((p) => [p.id, p]))
    const cartItems = products.map((p) => ({ ...p, qty: qty[p.id] || 0 })).filter((p) => p.qty > 0)
    const total = cartItems.reduce((s, p) => s + p.qty * p.price, 0)

    async function handleConfirmPayment() {
        if (!selectedSeller || cartItems.length === 0) return

        setPixStatus("confirming")
        setPixError("")

        try {
            // 1. Process each sale transaction sequentially
            for (const item of cartItems) {
                const { error } = await api.POST("/transactions/sale", {
                    body: {
                        product_id: item.id,
                        salesman_id: selectedSeller.id,
                        quantity: item.qty,
                        total_revenue: item.qty * item.price,
                        payment_type: "PIX",
                    }
                })

                // If a specific item fails, halt the entire process and show the error
                if (error) {
                    let errorMsg = "Erro na transação"
                    if (error.detail) {
                        if (typeof error.detail === "string") {
                            errorMsg = error.detail
                        } else if (Array.isArray(error.detail)) {
                            errorMsg = error.detail.map((d: any) => d.msg).join("; ")
                        }
                    }

                    // You can customize this string to show which item failed
                    setPixError(`Falha ao registrar item (${item.id}): ${errorMsg}`)
                    setPixStatus("waiting")
                    return // Prevent subsequent items from being processed
                }
            }

            // 2. Refresh stock in the background
            api.GET("/reports/stock")
                .then(({ data, error }) => {
                    // If it fails HTTP validation or returns no data, fail silently
                    // exactly like your original empty .catch(() => {}) did.
                    if (error || !data) return

                    const stockMap: Record<string, number> = {}
                    data.items.forEach((i) => {
                        stockMap[i.product_id] = parseFloat(i.quantity)
                    })
                    setStock(stockMap)
                })
                // Catch hard network failures on the background request
                .catch(() => { })

            // 3. Mark as success if the loop finishes without returning
            setPixStatus("confirmed")

        } catch (err) {
            // 4. Catch catastrophic network failures for the main checkout loop
            const errMsg = err instanceof Error ? err.message : String(err)
            setPixError(`Erro de conexão: ${errMsg}`)
            setPixStatus("waiting")
        }
    }

    let content: React.ReactNode
    if (initStatus === "loading") {
        content = <StatusScreen mode="loading" />
    } else if (initStatus === "error") {
        content = <StatusScreen mode="error" message={initError} onRetry={loadAll} />
    } else if (screen === "seller") {
        content = (
            <SellerScreen
                sellers={sellers}
                selectedId={selectedSellerId}
                setSelectedId={setSelectedSellerId}
                onCreateSeller={handleCreateSeller}
                creating={creatingSeller}
                onNext={() => setScreen("cart")}
            />
        )
    } else if (screen === "cart") {
        content = (
            <CartScreen
                seller={selectedSeller}
                products={products}
                stock={stock}
                qty={qty}
                setQty={setQty}
                onBack={() => setScreen("seller")}
                onClose={() => {
                    setPixStatus("waiting")
                    setPixError("")
                    setScreen("pix")
                }}
            />
        )
    } else if (screen === "pix") {
        content = (
            <PixScreen
                total={total}
                status={pixStatus}
                error={pixError}
                onConfirm={handleConfirmPayment}
                onNewSale={() => {
                    setQty({})
                    setScreen("cart")
                }}
            />
        )
    }

    return (
        <div
            className="w-full min-h-svh font-body bg-paper bg-[radial-gradient(circle,var(--color-paperLine)_1px,transparent_1px)] bg-size[18px_18px]"
        >
            {content}
        </div>
    )
}
