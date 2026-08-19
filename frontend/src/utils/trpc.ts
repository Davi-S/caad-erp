/**
 * tRPC React client initialization and type binding for full-stack autocompletion.
 */

import { httpBatchLink } from "@trpc/client"
import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "@backend/src/trpc/index.js"

/**
 * React hooks wrapper for the tRPC backend API.
 */
export const trpc = createTRPCReact<AppRouter>()

/**
 * Configured tRPC client instance connecting to the standalone Node HTTP server on port 8000.
 */
export const trpcClient = trpc.createClient({
    links: [
        httpBatchLink({
            url: "http://localhost:8000/trpc",
        }),
    ],
})
