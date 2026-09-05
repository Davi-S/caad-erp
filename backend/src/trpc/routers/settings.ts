import { publicProcedure, router } from "../trpc.js"
import { z } from "zod"
import { getBackendConfig, saveBackendConfig } from "../../config.js"

export const settingsRouter = router({
    getBackendConfig: publicProcedure.query(() => {
        const config = getBackendConfig()
        return {
            mercadoPagoPayerEmail: config.mercadoPagoPayerEmail,
            hasAccessToken: !!config.mercadoPagoAccessToken,
        }
    }),
    updateBackendConfig: publicProcedure
        .input(
            z.object({
                mercadoPagoAccessToken: z.string().optional(),
                mercadoPagoPayerEmail: z.string().default("example@gmail.com"),
            }),
        )
        .mutation(({ input }) => {
            const current = getBackendConfig()

            const tokenToSave =
                input.mercadoPagoAccessToken !== undefined
                    ? input.mercadoPagoAccessToken
                    : current.mercadoPagoAccessToken

            const success = saveBackendConfig({
                mercadoPagoAccessToken: tokenToSave,
                mercadoPagoPayerEmail: input.mercadoPagoPayerEmail,
            })

            if (!success) {
                throw new Error("Failed to write configuration file to disk.")
            }
            return { success: true }
        }),
})
