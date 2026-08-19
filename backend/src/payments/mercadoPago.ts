/**
 * Mercado Pago PIX payment REST handler.
 *
 * The Mercado Pago access token is read from the MERCADO_PAGO_ACCESS_TOKEN
 * environment variable, which must be set in backend/.env before running.
 */

import { MercadoPagoConfig, Payment } from "mercadopago"
import type { IncomingMessage, ServerResponse } from "http"

/** Lazily-constructed Mercado Pago client (initialized on first request). */
let mpClient: MercadoPagoConfig | null = null

/**
 * Returns the shared {@link MercadoPagoConfig} instance, creating it on first
 * call and throwing if the access token is not configured.
 */
function getMpClient(): MercadoPagoConfig {
    if (!mpClient) {
        const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
        if (!token) {
            throw new Error(
                "MERCADO_PAGO_ACCESS_TOKEN is not set. Add it to `backend/.env`.",
            )
        }
        mpClient = new MercadoPagoConfig({ accessToken: token })
    }
    return mpClient
}

/**
 * Reads and parses the request body as JSON.
 */
function readJson(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let body = ""
        req.on("data", (chunk: Buffer) => {
            body += chunk.toString()
        })
        req.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"))
            } catch {
                reject(new Error("Invalid JSON body"))
            }
        })
        req.on("error", reject)
    })
}

/**
 * Sends a JSON response.
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
    })
    res.end(payload)
}

/**
 * Sends a JSON error response.
 */
function sendError(res: ServerResponse, status: number, message: string): void {
    sendJson(res, status, { error: message })
}

/**
 * Handles `POST /api/payments/pix`.
 *
 * Expects body: `{ transactionAmount: number, description: string }`
 * Returns: `{ id, qr_code_base64 }`
 */
async function handleCreatePix(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown
    try {
        body = await readJson(req)
    } catch {
        sendError(res, 400, "Invalid request body")
        return
    }

    const { transactionAmount, description } = body as {
        transactionAmount?: unknown
        description?: unknown
    }

    if (typeof transactionAmount !== "number" || transactionAmount <= 0) {
        sendError(res, 400, "transactionAmount must be a positive number")
        return
    }
    if (typeof description !== "string" || description.trim().length === 0) {
        sendError(res, 400, "description must be a non-empty string")
        return
    }

    try {
        const payment = new Payment(getMpClient())
        const result = await payment.create({
            body: {
                transaction_amount: transactionAmount,
                description: description.trim(),
                payment_method_id: "pix",
                payer: {
                    email: "cliente@caad.erp",
                },
            },
        })

        const qrCodeBase64 = result.point_of_interaction?.transaction_data?.qr_code_base64
        const paymentId = result.id

        if (!qrCodeBase64 || paymentId === undefined) {
            sendError(res, 502, "Resposta inválida do Mercado Pago")
            return
        }

        sendJson(res, 200, { id: paymentId, qr_code_base64: qrCodeBase64 })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro interno ao criar pagamento PIX"
        console.error("[payments] POST /api/payments/pix failed:", message)
        sendError(res, 502, message)
    }
}

/**
 * Handles `GET /api/payments/pix/:id`.
 *
 * Returns: `{ status: string }` - e.g. `"approved"`, `"pending"`, `"cancelled"`.
 */
async function handleGetPixStatus(
    res: ServerResponse,
    paymentId: string,
): Promise<void> {
    const id = Number(paymentId)
    if (!Number.isInteger(id) || id <= 0) {
        sendError(res, 400, "Invalid payment ID")
        return
    }

    try {
        const payment = new Payment(getMpClient())
        const result = await payment.get({ id })
        sendJson(res, 200, { status: result.status ?? "unknown" })
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "Erro interno ao consultar status do pagamento"
        console.error(`[payments] GET /api/payments/pix/${id} failed:`, message)
        sendError(res, 502, message)
    }
}

/**
 * Routes a request to the appropriate Mercado Pago handler.
 *
 * @returns `true` if the request matched a payments route, `false` otherwise.
 */
export async function handlePaymentsRoute(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    const url = req.url ?? ""

    // POST /api/payments/pix
    if (req.method === "POST" && url === "/api/payments/pix") {
        await handleCreatePix(req, res)
        return true
    }

    // GET /api/payments/pix/:id
    const statusMatch = url.match(/^\/api\/payments\/pix\/([^/?]+)$/)
    if (req.method === "GET" && statusMatch) {
        await handleGetPixStatus(res, statusMatch[1])
        return true
    }

    return false
}
