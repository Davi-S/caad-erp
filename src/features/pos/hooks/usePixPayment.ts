import { useState, useEffect, useCallback, useRef } from "react"
import { createPixPayment, checkPaymentStatus } from "@/api/mercadoPago"

interface UsePixPaymentParams {
    amountInBrl: number
    salesmanName: string
    confirmed: boolean
    onPaymentApproved: () => void
}

export function usePixPayment({
    amountInBrl,
    salesmanName,
    confirmed,
    onPaymentApproved,
}: UsePixPaymentParams) {
    const [paymentId, setPaymentId] = useState<number | string | null>(null)
    const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const hasAutoConfirmed = useRef(false)

    const handleCreatePix = useCallback(async () => {
        if (amountInBrl <= 0) return
        setLoading(true)
        setError(null)
        try {
            const data = await createPixPayment(amountInBrl, `Venda - ${salesmanName}`)
            setPaymentId(data.id)
            setQrCodeBase64(data.qr_code_base64)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erro ao gerar PIX com Mercado Pago."
            setError(msg)
        } finally {
            setLoading(false)
        }
    }, [amountInBrl, salesmanName])

    // Auto-generate PIX payment on mount or amount change
    useEffect(() => {
        if (!confirmed) {
            handleCreatePix()
        }
    }, [handleCreatePix, confirmed])

    // Poll payment status via Mercado Pago API
    useEffect(() => {
        if (!paymentId || confirmed || hasAutoConfirmed.current) return

        const intervalId = setInterval(async () => {
            try {
                const statusRes = await checkPaymentStatus(paymentId)
                if (statusRes.status === "approved" && !hasAutoConfirmed.current) {
                    hasAutoConfirmed.current = true
                    clearInterval(intervalId)
                    onPaymentApproved()
                }
            } catch (err: unknown) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : "Erro ao verificar status do pagamento PIX no Mercado Pago."
                setError(msg)
                clearInterval(intervalId)
            }
        }, 3000)

        return () => clearInterval(intervalId)
    }, [paymentId, confirmed, onPaymentApproved])

    return {
        paymentId,
        qrCodeBase64,
        loading,
        error,
        retry: handleCreatePix,
    }
}
