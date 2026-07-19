import { ScreenShell } from "./ScreenShell"
import { AlertTriangle, Loader2 } from "lucide-react"

export function StatusScreen({ mode, message, onRetry }: {
    mode: "loading" | "error"
    message?: string
    onRetry?: () => void
}) {
    return (
        <ScreenShell>
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
                {mode === "loading" ? (
                    <Loader2 size={28} className="animate-spin text-teal" />
                ) : (
                    <AlertTriangle size={28} className="text-stamp" />
                )}
                <p className="font-body text-ink text-sm font-semibold">
                    {mode === "loading" ? "Carregando dados do CAAD-ERP..." : "Erro"}
                </p>
                {message && (
                    <p className="font-body text-inkFaint text-[13px]">
                        {message}
                    </p>
                )}
                {mode === "error" && onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-2 px-4 py-2.5 rounded-2xl bg-ink text-white font-display font-bold text-sm"
                    >
                        Tentar de novo
                    </button>
                )}
            </div>
        </ScreenShell>
    )
}
