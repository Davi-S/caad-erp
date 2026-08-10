export interface PixPaymentResponse {
    id: number | string
    status: string
    status_detail?: string
    qr_code?: string
    qr_code_base64: string
    ticket_url?: string
}

export interface PaymentStatusResponse {
    id: number | string
    status: string
    status_detail?: string
}

const MP_BASE_URL = "/api-mp"

export async function createPixPayment(
    amountInBrl: number,
    description = "Venda CAAD ERP",
): Promise<PixPaymentResponse> {
    const token = import.meta.env.VITE_MERCADO_PAGO_ACCESS_TOKEN

    if (!token || !token.trim()) {
        throw new Error(
            "Token do Mercado Pago não configurado. Defina a variável VITE_MERCADO_PAGO_ACCESS_TOKEN no arquivo .env.",
        )
    }

    let res: Response
    try {
        res = await fetch(`${MP_BASE_URL}/v1/payments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token.trim()}`,
                "X-Idempotency-Key":
                    typeof crypto !== "undefined" && crypto.randomUUID
                        ? crypto.randomUUID()
                        : `${Date.now()}-${Math.random()}`,
            },
            body: JSON.stringify({
                transaction_amount: amountInBrl,
                description: description,
                payment_method_id: "pix",
                payer: {
                    email: "cliente@caad.com",
                },
            }),
        })
    } catch (networkErr: unknown) {
        const detail = networkErr instanceof Error ? networkErr.message : String(networkErr)
        throw new Error(
            `Erro de conexão/CORS ao acessar Mercado Pago (${detail}). Verifique a conexão de rede e permissões.`,
        )
    }

    let data: any
    try {
        data = await res.json()
    } catch {
        throw new Error(`Resposta inválida do Mercado Pago (HTTP ${res.status}).`)
    }

    if (!res.ok) {
        const errorMsg =
            data?.message ||
            (Array.isArray(data?.cause) && data.cause[0]?.description) ||
            data?.error ||
            `Erro HTTP ${res.status} ao conectar com o Mercado Pago.`
        throw new Error(errorMsg)
    }

    const qrCode = data.point_of_interaction?.transaction_data?.qr_code
    const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64

    if (!data.id || !qrCodeBase64) {
        throw new Error(
            "Falha na API do Mercado Pago: A resposta não retornou os dados completos do QR Code PIX.",
        )
    }

    return {
        id: data.id,
        status: data.status,
        status_detail: data.status_detail,
        qr_code: qrCode,
        qr_code_base64: qrCodeBase64,
        ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
    }
}

export async function checkPaymentStatus(
    paymentId: number | string,
): Promise<PaymentStatusResponse> {
    const token = import.meta.env.VITE_MERCADO_PAGO_ACCESS_TOKEN

    if (!token || !token.trim()) {
        throw new Error(
            "Token do Mercado Pago não configurado. Defina a variável VITE_MERCADO_PAGO_ACCESS_TOKEN no ambiente.",
        )
    }

    let res: Response
    try {
        res = await fetch(`${MP_BASE_URL}/v1/payments/${paymentId}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token.trim()}`,
            },
        })
    } catch (networkErr: unknown) {
        const detail = networkErr instanceof Error ? networkErr.message : String(networkErr)
        throw new Error(`Erro de conexão ao verificar status do PIX (${detail}).`)
    }

    let data: any
    try {
        data = await res.json()
    } catch {
        throw new Error(
            `Resposta inválida ao verificar status no Mercado Pago (HTTP ${res.status}).`,
        )
    }

    if (!res.ok) {
        const errorMsg =
            data?.message ||
            (Array.isArray(data?.cause) && data.cause[0]?.description) ||
            data?.error ||
            `Erro HTTP ${res.status} ao verificar status do pagamento.`
        throw new Error(errorMsg)
    }

    if (!data.status) {
        throw new Error("Resposta do Mercado Pago inválida: status do pagamento não informado.")
    }

    return {
        id: data.id,
        status: data.status,
        status_detail: data.status_detail,
    }
}
