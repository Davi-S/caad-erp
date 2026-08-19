export interface PixPaymentResponse {
    id: number | string
    qr_code_base64: string
}

export interface PaymentStatusResponse {
    status: string
}

export async function createPixPayment(
    transactionAmount: number,
    description: string,
): Promise<PixPaymentResponse> {
    const res = await fetch("/api/payments/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionAmount, description }),
    })
    if (!res.ok) {
        throw new Error("Falha ao gerar QR Code PIX.")
    }
    return res.json()
}

export async function checkPaymentStatus(
    paymentId: number | string,
): Promise<PaymentStatusResponse> {
    const res = await fetch(`/api/payments/pix/${paymentId}`)
    if (!res.ok) {
        throw new Error("Falha ao verificar status do pagamento.")
    }
    return res.json()
}
