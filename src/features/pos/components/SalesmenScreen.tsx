import { useState } from "react"
import { Check } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import type { Salesmen } from "@/types"

interface SalesmenScreenProps {
    salesmen: Salesmen
    onNext: (salesmanId: string) => void
}

export function SalesmenScreen({
    salesmen,
    onNext
}: SalesmenScreenProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    return (
        <ScreenShell>
            <div className="flex-1 flex flex-col px-4 sm:px-6 pt-4 pb-6 overflow-y-auto">

                <h1 className="mt-1 mb-6 leading-tight font-display font-bold text-ink text-[26px]">
                    Quem tá vendendo hoje?
                </h1>

                <div className="flex flex-col gap-2">
                    {salesmen.length === 0 && (
                        <p className="font-body text-inkFaint text-[13px]">
                            Nenhum vendedor cadastrado ainda no CAAD-ERP.
                        </p>
                    )}
                    {salesmen.filter((salesman) => salesman.is_active).map((salerman) => {
                        const isSel = selectedId === salerman.salesman_id
                        return (
                            <button
                                key={salerman.salesman_id}
                                onClick={() => setSelectedId(salerman.salesman_id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border-[1.5px] border-solid ${isSel
                                    ? "bg-tealSoft border-teal"
                                    : "bg-card border-paperLine"
                                    }`}
                            >
                                <span className="font-body text-ink font-semibold text-[15px]">
                                    {salerman.salesman_name}
                                </span>
                                {isSel && (
                                    <span className="ml-auto">
                                        <Check size={18} className="text-teal" />
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

            </div>

            <div className="px-4 sm:px-6 pb-7 pt-3 shrink-0 border-t border-dashed border-paperLine">
                <button
                    disabled={!selectedId}
                    onClick={() => onNext(selectedId)}
                    className="w-full py-3.5 rounded-2xl transition-opacity text-white font-display font-bold text-[15px] bg-ink disabled:bg-inkFaint disabled:opacity-60"
                >
                    Começar venda
                </button>
            </div>

        </ScreenShell>
    )
}
