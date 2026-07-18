import { Plus, Minus, ArrowLeft, Pencil } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import { brl } from "@/helpers"
import type { Products, Salesman, Stock } from "@/types"

interface CartScreenProps {
    salesman: Salesman
    catalog: {
        products: Products
        stock: Stock
    }
    cartState: {
        cart: Record<string, number>
        cartIterable: [string, number][]
        total: number
        isEmpty: boolean
        inc: (id: string) => void
        dec: (id: string) => void
        removeItem: (id: string) => void
    }
    actions: {
        onBack: () => void
        onClose: () => void
    }
}

export function CartScreen({
    salesman: selesman,
    catalog,
    cartState,
    actions
}: CartScreenProps) {
    const { products, stock } = catalog
    const { cart, cartIterable, total, isEmpty, inc, dec, removeItem } = cartState
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
                        Venda de {selesman?.salesman_name}
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
                                onClick={() => cart[product.product_id] > 0 ? removeItem(product.product_id) : inc(product.product_id)}
                                disabled={soldOut}
                                className="flex flex-col items-center justify-center gap-1 rounded-2xl py-3 relative bg-card border border-solid border-paperLine disabled:opacity-45"
                            >
                                {cart[product.product_id] > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center w-5 h-5 bg-teal text-white font-mono text-[11px] font-semibold">
                                        {cart[product.product_id]}
                                    </span>
                                )}
                                <span className="font-body text-ink text-xs font-semibold text-center px-1">
                                    {product.product_name}
                                </span>

                                <div className="flex flex-col items-center">
                                    <span className="font-mono text-inkSoft text-[11px]">
                                        {soldOut ? "Esgotado" : brl(product.sell_price)}
                                    </span>
                                    {!soldOut && available !== undefined && (
                                        <span className="font-body text-inkFaint text-[9px] uppercase tracking-widest mt-0.5">
                                            {available} disp.
                                        </span>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>

                <div className="pt-3 border-t border-dashed border-paperLine">
                    {isEmpty ? (
                        <div className="flex flex-col items-center text-center py-10 gap-2">
                            <p className="font-body text-inkFaint text-[13px]">
                                Nenhum item ainda.
                                <br />
                                Toque em um produto acima pra começar.
                            </p>
                        </div>
                    ) : (
                        cartIterable.map(([productId, quantity]) => {
                            const product = products.find(p => p.product_id === productId)
                            return (
                                <div key={productId} className="flex items-center gap-2 py-2">
                                    <span className="flex-1 font-body text-ink text-sm font-medium">
                                        {product.product_name}
                                    </span>
                                    <div className="flex items-center gap-2 rounded-full px-1 bg-paper border border-solid border-paperLine">
                                        <button onClick={() => dec(productId)} className="p-1">
                                            <Minus size={12} className="text-inkSoft" />
                                        </button>
                                        <span className="font-mono text-xs text-ink min-w-3.5 text-center">
                                            {quantity}
                                        </span>
                                        <button onClick={() => inc(productId)} className="p-1">
                                            <Plus size={12} className="text-inkSoft" />
                                        </button>
                                    </div>
                                    <span className="font-mono text-ink text-[13px] min-w-15.56 text-right">
                                        {brl(quantity * product.sell_price)}
                                    </span>
                                </div>
                            )
                        })
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
