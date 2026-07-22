import { useState } from "react"
import { SalesmanSelectScreen } from "@/components/SalesmanSelectScreen"
import { StockManagementScreen } from "./components/StockManagementScreen"
import { useSalesmen } from "@/hooks/queries/useSalesmen"

export function StockFlow() {
    const { data: salesmen } = useSalesmen()

    const [selectedSalesmanId, setSelectedSalesmanId] = useState<string | null>(null)
    const selectedSalesman = salesmen.find((s) => s.salesman_id === selectedSalesmanId) || null

    if (!selectedSalesman) {
        return (
            <SalesmanSelectScreen
                salesmen={salesmen.filter((s) => s.is_active)}
                title="Quem está mexendo no estoque?"
                confirmLabel="Acessar estoque"
                onNext={setSelectedSalesmanId}
            />
        )
    }

    return (
        <StockManagementScreen
            salesman={selectedSalesman}
            onSwitchSalesman={() => setSelectedSalesmanId(null)}
        />
    )
}
