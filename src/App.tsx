import { StatusScreen } from "./components/StatusScreen"
import { POSFlow } from "./features/pos/"
import { useSalesmen } from "@/hooks/queries/useSalesmen"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"

export default function App() {

    const { isLoading: isSalesmenLoading, isError: isSalesmenError, refetch: refetchSalesmen } = useSalesmen()
    const { isLoading: isProductsLoading, isError: isProductsError, refetch: refetchProducts } = useProducts()
    const { isLoading: isStockLoading, isError: isStockError, refetch: refetchStock } = useStock()

    const isLoading = isProductsLoading || isSalesmenLoading || isStockLoading
    const isError = isProductsError || isSalesmenError || isStockError

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

            {!isLoading && !isError && <POSFlow />}
        </div>
    )
}
