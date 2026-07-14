import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { brl, buildQrGrid, QR_SIZE } from "../helpers"

const QR_GRID = buildQrGrid()

// ---------------- Screen 3: PIX QR ----------------
export function PixScreen({ total, status, error, onConfirm, onNewSale }) {
    const [copied, setCopied] = useState(false)
    const confirmed = status === "confirmed"
    const confirming = status === "confirming"

    return (
        <div
            className="w-full min-h-svh flex flex-col items-center justify-center px-4 sm:px-5 bg-ink pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
        >
            <div className="relative w-full max-w-xs mt-2">
                {confirmed && (
                    <div className="absolute z-10 -top-[14px] -right-[6px] w-[84px] h-[84px] rounded-full border-[3px] border-solid border-stamp flex flex-col items-center justify-center -rotate-12 bg-stamp/[0.06]">
                        <span className="font-display text-stamp font-bold text-[15px] tracking-wider">
                            PAGO
                        </span>
                        <Check size={14} className="text-stamp" />
                    </div>
                )}

                <div className="bg-card pt-5">
                    <div className="flex flex-col items-center px-4 sm:px-6 pb-7">
                        <span className={`mb-1 font-body font-bold text-xs tracking-[0.14em] ${confirmed ? "text-teal" : "text-mustard"}`}>
                            {confirmed ? "PAGAMENTO CONFIRMADO" : "AGUARDANDO PAGAMENTO"}
                            {!confirmed && <span className="animate-pulse ml-1">●</span>}
                        </span>

                        <div
                            className="grid my-4"
                            style={{ gridTemplateColumns: `repeat(${QR_SIZE}, 15px)`, gridTemplateRows: `repeat(${QR_SIZE}, 15px)` }}
                        >
                            {QR_GRID.flatMap((row, r) =>
                                row.map((cell, c) => (
                                    <div
                                        key={r + "-" + c}
                                        className={`w-3.75 h-3.75 ${cell ? "bg-ink" : "bg-transparent"}`}
                                    />
                                ))
                            )}
                        </div>

                        <span className="font-mono text-ink text-[26px] font-semibold">
                            {brl(total)}
                        </span>
                        <span className="font-body text-inkFaint text-xs mt-0.5">
                            Pix • código de pagamento
                        </span>

                        <button
                            onClick={() => {
                                setCopied(true)
                                setTimeout(() => setCopied(false), 1500)
                            }}
                            className="flex items-center gap-2 mt-4 px-3 py-2 rounded-xl w-full justify-center bg-paper border border-solid border-paperLine"
                        >
                            <span className="font-mono text-[11px] text-inkSoft">
                                {copied ? "Copiado!" : "pix •••• 8f2a-91cd"}
                            </span>
                            <Copy size={13} className="text-inkSoft" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-xs mt-6">
                {error && (
                    <p className="mb-3 text-center font-body text-stampSoft text-xs">
                        {error}
                    </p>
                )}
                {!confirmed ? (
                    <button
                        onClick={onConfirm}
                        disabled={confirming}
                        className="w-full py-3.5 rounded-2xl bg-teal text-white font-display font-bold text-sm disabled:opacity-70"
                    >
                        {confirming ? "Registrando venda..." : "Já recebi o pagamento"}
                    </button>
                ) : (
                    <button
                        onClick={onNewSale}
                        className="w-full py-3.5 rounded-2xl bg-transparent text-white border-[1.5px] border-solid border-[#ffffff55] font-display font-bold text-sm"
                    >
                        Nova venda
                    </button>
                )}
            </div>
        </div>
    )
}
