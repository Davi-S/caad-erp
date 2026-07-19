import { useState, useEffect } from "react"
import { Check, Copy, ArrowLeft, QrCode, Banknote, CreditCard, MoreHorizontal } from "lucide-react"
import { brl, buildQrGrid, QR_SIZE } from "@/helpers"
import { ScreenShell } from "@/components/ScreenShell"
import type { PaymentType } from "@/types"
import type { Salesman } from "@/types"
import { useCart } from "../hooks/useCart"
import { useCheckout } from "../hooks/useCheckout"

const QR_GRID = buildQrGrid()

interface PaymentScreenProps {
    salesman: Salesman
    cartState: ReturnType<typeof useCart>
    checkoutState: ReturnType<typeof useCheckout>
    actions: {
        onConfirm: (method: PaymentType) => void
        onNewSale: () => void
        onEdit: () => void
        onCancel: () => void
    }
}

export function PaymentScreen({ salesman, cartState, checkoutState, actions }: PaymentScreenProps) {
    const [method, setMethod] = useState<PaymentType>("PIX")
    const [copied, setCopied] = useState(false)

    const { status, error, resetCheckout } = checkoutState
    const { onConfirm, onNewSale, onEdit, onCancel } = actions

    useEffect(() => {
        resetCheckout()
    }, [])

    const confirmed = status === "success"
    const confirming = status === "pending"
    const isLocked = status === "pending" || status === "success"

    return (
        <ScreenShell>
            {/* Top Navigation Bar */}
            <div className="px-4 sm:px-6 pt-4 shrink-0 mb-2">
                <div className="flex justify-between items-center mb-3">
                    <button
                        onClick={onEdit}
                        disabled={isLocked}
                        className="flex items-center gap-1 p-1 -ml-1 text-ink disabled:opacity-30"
                    >
                        <ArrowLeft size={20} />
                        <span className="font-body text-sm font-medium">Editar itens</span>
                    </button>

                    <button
                        onClick={onCancel}
                        disabled={isLocked}
                        className="font-body text-sm font-medium text-stamp disabled:opacity-30"
                    >
                        Cancelar venda
                    </button>
                </div>

                <h1 className="font-display text-ink text-xl font-bold text-center">
                    Venda de {salesman?.salesman_name}
                </h1>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center w-full max-w-xs mx-auto">
                <div className="relative w-full max-w-xs mt-2">

                    {/* Success Stamp Overlay */}
                    {confirmed && (
                        <div className="absolute z-10 -top-3.5 -right-1.5 w-21 h-21 rounded-full border-[3px] border-solid border-stamp flex flex-col items-center justify-center -rotate-12 bg-stamp/6">
                            <span className="font-display text-stamp font-bold text-[15px] tracking-wider">
                                PAGO
                            </span>
                            <Check size={14} className="text-stamp" />
                        </div>
                    )}

                    <div className="bg-card pt-5 rounded-xl shadow-sm border border-solid border-paperLine">
                        <div className="flex flex-col items-center px-4 sm:px-6 pb-7">
                            <span className={`mb-4 font-body font-bold text-xs tracking-[0.14em] ${confirmed ? "text-teal" : "text-mustard"}`}>
                                {confirmed ? "PAGAMENTO CONFIRMADO" : "AGUARDANDO PAGAMENTO"}
                                {!confirmed && <span className="animate-pulse ml-1">...</span>}
                            </span>

                            <span className="font-mono text-ink text-[32px] font-semibold mb-6">
                                {brl(cartState.total)}
                            </span>

                            {/* Payment Method Selector */}
                            <div className="grid grid-cols-4 gap-2 w-full mb-6">
                                <MethodToggle
                                    icon={<QrCode size={18} />}
                                    label="Pix"
                                    active={method === "PIX"}
                                    disabled={isLocked}
                                    onClick={() => setMethod("PIX")}
                                />
                                <MethodToggle
                                    icon={<Banknote size={18} />}
                                    label="Dinheiro"
                                    active={method === "Cash"}
                                    disabled={isLocked}
                                    onClick={() => setMethod("Cash")}
                                />
                                <MethodToggle
                                    icon={<CreditCard size={18} />}
                                    label="Fiado"
                                    active={method === "OnCredit"}
                                    disabled={isLocked}
                                    onClick={() => setMethod("OnCredit")}
                                />
                                <MethodToggle
                                    icon={<MoreHorizontal size={18} />}
                                    label="Outro"
                                    active={method === "Other"}
                                    disabled={isLocked}
                                    onClick={() => setMethod("Other")}
                                />
                            </div>

                            {/* Dynamic Content Area */}
                            <div className="w-full flex flex-col items-center min-h-45 justify-center bg-paper rounded-lg border border-dashed border-paperLine p-4">
                                {method === "PIX" && (
                                    <>
                                        <div
                                            className="grid mb-4"
                                            style={{ gridTemplateColumns: `repeat(${QR_SIZE}, 12px)`, gridTemplateRows: `repeat(${QR_SIZE}, 12px)` }}
                                        >
                                            {QR_GRID.flatMap((row, r) =>
                                                row.map((cell, c) => (
                                                    <div
                                                        key={r + "-" + c}
                                                        className={`w-3 h-3 ${cell ? "bg-ink" : "bg-transparent"}`}
                                                    />
                                                ))
                                            )}
                                        </div>
                                        <button
                                            disabled={isLocked}
                                            onClick={() => {
                                                setCopied(true)
                                                setTimeout(() => setCopied(false), 1500)
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 rounded-xl w-full justify-center bg-card border border-solid border-paperLine disabled:opacity-50"
                                        >
                                            <span className="font-mono text-[11px] text-inkSoft">
                                                {copied ? "Copiado!" : "pix •••• 8f2a-91cd"}
                                            </span>
                                            <Copy size={13} className="text-inkSoft" />
                                        </button>
                                    </>
                                )}

                                {method === "Cash" && (
                                    <p className="font-body text-sm text-inkSoft text-center">
                                        Receba o valor em espécie e confirme abaixo.
                                    </p>
                                )}

                                {method === "OnCredit" && (
                                    <p className="font-body text-sm text-inkSoft text-center">
                                        O valor será adicionado à conta do cliente.
                                    </p>
                                )}

                                {method === "Other" && (
                                    <p className="font-body text-sm text-inkSoft text-center">
                                        Utilize a maquininha de cartão ou outro método externo.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Action Area */}
                <div className="w-full max-w-xs mt-6">
                    {error && (
                        <p className="mb-3 text-center font-body text-stamp text-xs">
                            {error}
                        </p>
                    )}

                    {!confirmed ? (
                        <button
                            onClick={() => onConfirm(method)}
                            disabled={confirming}
                            className="w-full py-3.5 rounded-2xl bg-teal text-white font-display font-bold text-sm disabled:opacity-70"
                        >
                            {confirming ? "Registrando venda..." : "Já recebi o pagamento"}
                        </button>
                    ) : (
                        <button
                            onClick={onNewSale}
                            className="w-full py-3.5 rounded-2xl bg-transparent text-teal border-[1.5px] border-solid border-teal font-display font-bold text-sm"
                        >
                            Nova venda
                        </button>
                    )}
                </div>
            </div>
        </ScreenShell>
    )
}

// Small helper component for the payment method buttons
function MethodToggle({ icon, label, active, disabled, onClick }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg border-2 transition-colors ${active
                ? "border-teal bg-teal/10 text-teal"
                : "border-transparent bg-paper text-inkSoft hover:bg-paperLine disabled:hover:bg-paper"
                } disabled:opacity-40`}
        >
            {icon}
            <span className="font-body text-[10px] font-semibold uppercase">{label}</span>
        </button>
    )
}
