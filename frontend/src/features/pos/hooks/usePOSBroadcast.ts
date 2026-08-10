import { useEffect, useRef, useState, useCallback } from "react"
import {
    type POSBroadcastMessage,
    type POSBroadcastState,
    EMPTY_POS_STATE,
} from "../types/broadcast"

const CHANNEL_NAME = "caad_pos_display_channel"

// We pass getState into the hook to handle client reconnections.
// If the customer screen refreshes, it sends a "REQUEST_SYNC" message on mount.
// The hook uses this callback to fetch and broadcast the current state immediately,
// without waiting for a cashier action to trigger a new render.
export function usePOSBroadcast(role: "seller" | "client", getState?: () => POSBroadcastState) {
    const channelRef = useRef<BroadcastChannel | null>(null)
    const [syncedState, setSyncedState] = useState<POSBroadcastState | null>(null)

    // Store latest getState in a ref so the event listener always accesses fresh state
    const getStateRef = useRef(getState)
    getStateRef.current = getState

    useEffect(() => {
        const channel = new BroadcastChannel(CHANNEL_NAME)
        channelRef.current = channel

        channel.onmessage = (event: MessageEvent<POSBroadcastMessage>) => {
            if (role === "client" && event.data?.type === "POS_STATE_UPDATE") {
                setSyncedState(event.data.payload)
            } else if (role === "seller" && event.data?.type === "REQUEST_SYNC") {
                const currentState = getStateRef.current?.()
                if (currentState) {
                    channel.postMessage({
                        type: "POS_STATE_UPDATE",
                        payload: currentState,
                    })
                }
            }
        }

        if (role === "client") {
            // Request current state from seller on mount to prevent blank
            // screen bug it called late
            channel.postMessage({ type: "REQUEST_SYNC" })
        }

        // Graceful disconnection
        const handleUnload = () => {
            if (role === "seller" && channelRef.current) {
                channelRef.current.postMessage({
                    type: "POS_STATE_UPDATE",
                    payload: EMPTY_POS_STATE,
                })
            }
        }
        window.addEventListener("pagehide", handleUnload)
        window.addEventListener("beforeunload", handleUnload)

        // Cleanup to prevent memory leak and other problems
        return () => {
            handleUnload()
            window.removeEventListener("pagehide", handleUnload)
            window.removeEventListener("beforeunload", handleUnload)
            channel.close()
            channelRef.current = null
        }
    }, [role])

    const broadcastState = useCallback((state: POSBroadcastState) => {
        if (channelRef.current) {
            channelRef.current.postMessage({
                type: "POS_STATE_UPDATE",
                payload: state,
            })
        }
    }, [])

    return {
        syncedState,
        broadcastState,
    }
}
