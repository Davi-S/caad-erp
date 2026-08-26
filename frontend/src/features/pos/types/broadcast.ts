import type { Salesman, PaymentType } from "@/types"

export interface PixPaymentDetails {
    method: Extract<PaymentType, "PIX">
    qrCodeBase64?: string | null
    loading?: boolean
    error?: string | null
}

export interface GenericPaymentDetails {
    method: Exclude<PaymentType, "PIX">
}

export type PaymentDetails = PixPaymentDetails | GenericPaymentDetails

export interface POSBroadcastState {
    screen: "cart" | "payment"
    cart: Record<string, number>
    selectedSalesman: Salesman | null
    paymentDetails: PaymentDetails | null
    checkoutStatus: "idle" | "pending" | "success" | "error"
    checkoutError: string | null
    subtotal: number
    discount: number
    total: number
    openGroupId?: string | null
}

export const EMPTY_POS_STATE: POSBroadcastState = {
    screen: "cart",
    cart: {},
    selectedSalesman: null,
    paymentDetails: null,
    checkoutStatus: "idle",
    checkoutError: null,
    subtotal: 0,
    discount: 0,
    total: 0,
    openGroupId: null,
}

export type POSBroadcastMessage =
    | { type: "POS_STATE_UPDATE"; payload: POSBroadcastState }
    | { type: "REQUEST_SYNC" }
