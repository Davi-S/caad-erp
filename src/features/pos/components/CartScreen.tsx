import { Plus, Minus, ArrowLeft, Pencil } from "lucide-react"
import { ScreenShell } from "../../../components/ScreenShell"
import { brl } from "../../../helpers"
import type { Schemas } from "../../../api/apiClient"

interface CartScreenProps {
    seller: Schemas["SalesmanResponse"] | null
    catalog: {
        products: Schemas["ProductListResponse"]["items"]
        stock: Schemas["StockReportResponse"]["items"]
    }
    cart: {
        qty: Record<string, number>
        cartItems: any[]
        total: number
        inc: (id: string) => void
        dec: (id: string) => void
    }
    actions: {
        onBack: () => void
        onClose: () => void
    }
}

export function CartScreen({
    seller,
    catalog,
    cart,
    actions
}: CartScreenProps) {
    const { products, stock } = catalog
    const { qty, cartItems, total, inc, dec } = cart
    const { onBack, onClose } = actions
    const availableFor = (id: string) => stock[id]

    return (
        <ScreenShell>
            <div className="px-4 sm:px-6 pt-4 shrink-0">
                <div className="flex items-center gap-2 mb-4">
                    <button onClick={onBack} className="p-1 -ml-1">
                        <ArrowLeft size={20} className="text-ink" />
                    </button>
                    <h1 className="font-display text-ink text-xl font-bold">
                        Venda de {seller?.salesman_name}
                    </h1>
                    <button onClick={onBack} className="ml-auto p-1">
                        <Pencil size={14} className="text-inkFaint" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6">
                <p className="text-xs uppercase tracking-widest mb-2 font-body text-inkFaint font-semibold">
                    Toque para adicionar
                </p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                    {products.map((product) => {
                        const available = availableFor(product.product_id)
                        const soldOut = available !== undefined && available <= 0
                        return (
                            <button
                                key={product.product_id}
                                onClick={() => inc(product.product_id)}
                                disabled={soldOut}
                                className="flex flex-col items-center justify-center gap-1 rounded-2xl py-3 relative bg-card border border-solid border-paperLine disabled:opacity-45"
                            >
                                {qty[product.product_id] > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center w-5 h-5 bg-teal text-white font-mono text-[11px] font-semibold">
                                        {qty[product.product_id]}
                                    </span>
                                )}
                                <span className="font-body text-ink text-xs font-semibold">
                                    {product.product_name}
                                </span>
                                <span className="font-mono text-inkSoft text-[11px]">
                                    {soldOut ? "Esgotado" : brl(Number(product.sell_price))}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <div className="pt-3 border-t border-dashed border-paperLine">
                    {cartItems.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-10 gap-2">
                            <p className="font-body text-inkFaint text-[13px]">
                                Nenhum item ainda.
                                <br />
                                Toque em um produto acima pra começar.
                            </p>
                        </div>
                    ) : (
                        cartItems.map((p) => (
                            <div key={p.product_id} className="flex items-center gap-2 py-2">
                                <span className="text-base text-inkFaint mt-0.5">
                                </span>
                                <span className="flex-1 font-body text-ink text-sm font-medium">
                                    {p.product_name}
                                </span>
                                <div className="flex items-center gap-2 rounded-full px-1 bg-paper border border-solid border-paperLine">
                                    <button onClick={() => dec(p.product_id)} className="p-1">
                                        <Minus size={12} className="text-inkSoft" />
                                    </button>
                                    <span className="font-mono text-xs text-ink min-w-3.5 text-center">
                                        {p.qty}
                                    </span>
                                    <button onClick={() => inc(p.product_id)} className="p-1">
                                        <Plus size={12} className="text-inkSoft" />
                                    </button>
                                </div>
                                <span className="font-mono text-ink text-[13px] min-w-[62px] text-right">
                                    {brl(p.qty * Number(p.sell_price))}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="px-4 sm:px-6 pt-3 pb-7 shrink-0 border-t-[1.5px] border-dashed border-inkFaint">
                <div className="flex items-baseline justify-between mb-3">
                    <span className="font-body text-inkSoft text-[13px] font-semibold">
                        Total
                    </span>
                    <span className="font-mono text-ink text-2xl font-semibold">
                        {brl(total)}
                    </span>
                </div>
                <button
                    disabled={total === 0}
                    onClick={onClose}
                    className="w-full py-3.5 rounded-2xl text-white font-display font-bold text-[15px] bg-teal disabled:bg-inkFaint disabled:opacity-60"
                >
                    Fechar venda
                </button>
            </div>
        </ScreenShell>
    )
}
