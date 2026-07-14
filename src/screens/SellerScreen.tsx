import { Plus, Check } from "lucide-react"
import { ScreenShell } from "../components/ScreenShell"

const AVATAR_CLASSES = ["bg-teal", "bg-stamp", "bg-mustard"]

export function SellerScreen({ sellers, selectedId, setSelectedId, onCreateSeller, creating, onNext }) {
    return (
        <ScreenShell>
            <div className="flex-1 flex flex-col px-4 sm:px-6 pt-4 pb-6 overflow-y-auto">
                <h1 className="mt-1 mb-6 leading-tight font-display font-bold text-ink text-[26px]">
                    Quem tá vendendo hoje?
                </h1>

                <div className="flex flex-col gap-2">
                    {sellers.length === 0 && (
                        <p className="font-body text-inkFaint text-[13px]">
                            Nenhum vendedor cadastrado ainda no CAAD-ERP.
                        </p>
                    )}
                    {sellers.map((s, i) => {
                        const isSel = selectedId === s.id
                        return (
                            <button
                                key={s.id}
                                onClick={() => setSelectedId(s.id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border-[1.5px] border-solid ${isSel
                                    ? "bg-tealSoft border-teal"
                                    : "bg-card border-paperLine"
                                    }`}
                            >
                                <div className={`rounded-full flex items-center justify-center shrink-0 w-10 h-10 text-white font-display font-bold text-base ${AVATAR_CLASSES[i % AVATAR_CLASSES.length]}`}>
                                    {s.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-body text-ink font-semibold text-[15px]">
                                    {s.name}
                                </span>
                                {isSel && (
                                    <span className="ml-auto">
                                        <Check size={18} className="text-teal" />
                                    </span>
                                )}
                            </button>
                        )
                    })}

                    <button
                        disabled={creating}
                        onClick={onCreateSeller}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-[1.5px] border-dashed border-inkFaint bg-transparent disabled:opacity-60`}
                    >
                        <div className="rounded-full flex items-center justify-center shrink-0 w-10 h-10 border-[1.5px] border-dashed border-inkFaint">
                            <Plus size={16} className="text-inkSoft" />
                        </div>
                        <span className="font-body text-inkSoft font-semibold text-[15px]">
                            {creating ? "Cadastrando..." : "Novo vendedor"}
                        </span>
                    </button>
                </div>
            </div>

            <div className="px-4 sm:px-6 pb-7 pt-3 shrink-0 border-t border-dashed border-paperLine">
                <button
                    disabled={!selectedId}
                    onClick={onNext}
                    className="w-full py-3.5 rounded-2xl transition-opacity text-white font-display font-bold text-[15px] bg-ink disabled:bg-inkFaint disabled:opacity-60"
                >
                    Começar venda
                </button>
            </div>
        </ScreenShell>
    )
}
