import { useQuery } from "@tanstack/react-query"
import { api } from "./api/apiClient"
import { StatusScreen } from "./components/StatusScreen"
import { POSFlow } from "./features/pos/"
import type { Schemas } from "./api/apiClient"

export type Product = Schemas["ProductResponse"]
export type Products = Product[]
export type Salesman = Schemas["SalesmanResponse"]
export type Salesmen = Salesman[]
export type Stock = Record<string, number>
export type PaymentType = Schemas["PaymentType"]
export type SaleRequest = Schemas["SaleRequest"]
export type SalesRequests = SaleRequest[]

export default function App() {
    const {
        data: products,
        isLoading: isProductsLoading,
        isError: isProductsError,
        refetch: refetchProducts,
    } = useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const res = await api.GET("/products")
            if (res.error) throw new Error("Failed to fetch products")
            return res.data["items"]
        }
    })
    const {
        data: selesmen,
        isLoading: isSelesmenLoading,
        isError: isSelesmenError,
        refetch: refetchSalesmen,
    } = useQuery({
        queryKey: ['salesmen'],
        queryFn: async () => {
            const res = await api.GET("/salesmen")
            if (res.error) throw new Error("Failed to fetch salesmen")
            return res.data["items"]
        }
    })
    const {
        data: stock,
        isLoading: isStockLoading,
        isError: isStockError,
        refetch: refetchStock,
    } = useQuery({
        queryKey: ['stock'],
        queryFn: async () => {
            const res = await api.GET("/reports/stock")
            if (res.error) throw new Error("Failed to fetch stock")

            // Transform data to the fast format
            const stockMap: Stock = {}
            for (const item of res.data["items"]) {
                stockMap[item.product_id] = item.quantity
            }
            return stockMap
        }
    })

    const isLoading = isProductsLoading || isSelesmenLoading || isStockLoading
    const isError = isProductsError || isSelesmenError || isStockError


    return (
        <div className="w-full min-h-svh font-body bg-paper bg-[radial-gradient(circle,var(--color-paperLine)_1px,transparent_1px)] bg-size[18px_18px]">
            {isLoading && <StatusScreen mode="loading" />}

            {isError && (
                <StatusScreen
                    mode="error"
                    message="Failed to load initial data"
                    onRetry={() => { refetchProducts(), refetchStock(), refetchSalesmen() }}
                />
            )}

            {!isLoading && !isError && products && selesmen && stock && (
                <POSFlow
                    products={products}
                    selesmen={selesmen}
                    stock={stock}
                />
            )}
        </div>
    )
}
