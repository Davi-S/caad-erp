/**
 * Unit test suite for usePOSBroadcast hook across seller and client roles.
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePOSBroadcast } from "../../src/features/pos/hooks/usePOSBroadcast"
import { EMPTY_POS_STATE, type POSBroadcastState } from "../../src/features/pos/types/broadcast"

describe("usePOSBroadcast Hook", () => {
    let mockChannels: Map<string, MockBroadcastChannel[]>

    class MockBroadcastChannel {
        name: string
        onmessage: ((event: MessageEvent) => void) | null = null
        postMessage = vi.fn((data: any) => {
            const peers = mockChannels.get(this.name) || []
            peers.forEach((peer) => {
                if (peer !== this && peer.onmessage) {
                    peer.onmessage({ data } as MessageEvent)
                }
            })
        })
        close = vi.fn(() => {
            const peers = mockChannels.get(this.name) || []
            mockChannels.set(
                this.name,
                peers.filter((p) => p !== this),
            )
        })

        constructor(name: string) {
            this.name = name
            if (!mockChannels.has(name)) {
                mockChannels.set(name, [])
            }
            mockChannels.get(name)!.push(this)
        }
    }

    const originalBroadcastChannel = global.BroadcastChannel

    beforeEach(() => {
        mockChannels = new Map()
        global.BroadcastChannel = MockBroadcastChannel as any
    })

    afterEach(() => {
        global.BroadcastChannel = originalBroadcastChannel
        vi.restoreAllMocks()
    })

    const sampleState: POSBroadcastState = {
        screen: "cart",
        items: {
            P1: { productId: "P1", name: "Agua", unitPrice: 300, quantity: 2, discount: 0 },
        },
        selectedSalesman: { id: "S1", name: "Davi", isActive: true },
        paymentDetails: null,
        checkoutStatus: "idle",
        checkoutError: null,
        subtotal: 600,
        totalItemDiscount: 0,
        discount: 0,
        total: 600,
        openGroupId: null,
    }

    it("GIVEN client role WHEN mounted THEN broadcasts REQUEST_SYNC", () => {
        const { result } = renderHook(() => usePOSBroadcast("client"))

        expect(result.current.syncedState).toBeNull()
        const channels = mockChannels.get("caad_pos_display_channel")
        expect(channels).toHaveLength(1)
        expect(channels![0].postMessage).toHaveBeenCalledWith({ type: "REQUEST_SYNC" })
    })

    it("GIVEN seller role WHEN client requests sync THEN responds with currentState from getState callback", () => {
        const getState = vi.fn().mockReturnValue(sampleState)
        renderHook(() => usePOSBroadcast("seller", getState))

        const sellerChannel = mockChannels.get("caad_pos_display_channel")![0]

        // Simulate client requesting sync on channel
        sellerChannel.onmessage!({
            data: { type: "REQUEST_SYNC" },
        } as MessageEvent)

        expect(getState).toHaveBeenCalled()
        expect(sellerChannel.postMessage).toHaveBeenCalledWith({
            type: "POS_STATE_UPDATE",
            payload: sampleState,
        })
    })

    it("GIVEN seller role WHEN broadcastState is called THEN transmits updated POS state to channel", () => {
        const { result } = renderHook(() => usePOSBroadcast("seller"))
        const sellerChannel = mockChannels.get("caad_pos_display_channel")![0]

        act(() => {
            result.current.broadcastState(sampleState)
        })

        expect(sellerChannel.postMessage).toHaveBeenCalledWith({
            type: "POS_STATE_UPDATE",
            payload: sampleState,
        })
    })

    it("GIVEN client role WHEN POS_STATE_UPDATE message arrives THEN updates syncedState", () => {
        const { result } = renderHook(() => usePOSBroadcast("client"))
        const clientChannel = mockChannels.get("caad_pos_display_channel")![0]

        act(() => {
            clientChannel.onmessage!({
                data: { type: "POS_STATE_UPDATE", payload: sampleState },
            } as MessageEvent)
        })

        expect(result.current.syncedState).toEqual(sampleState)
    })

    it("GIVEN seller role WHEN window unloads or unmounts THEN broadcasts EMPTY_POS_STATE and closes channel", () => {
        const { unmount } = renderHook(() => usePOSBroadcast("seller"))
        const sellerChannel = mockChannels.get("caad_pos_display_channel")![0]

        unmount()

        expect(sellerChannel.postMessage).toHaveBeenCalledWith({
            type: "POS_STATE_UPDATE",
            payload: EMPTY_POS_STATE,
        })
        expect(sellerChannel.close).toHaveBeenCalled()
    })
})
