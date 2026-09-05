import { publicProcedure, router } from "../trpc.js"
import { BackendConfigSchema, getBackendConfig, saveBackendConfig } from "../../config.js"

export const settingsRouter = router({
    getBackendConfig: publicProcedure.query(() => {
        return getBackendConfig()
    }),
    updateBackendConfig: publicProcedure
        .input(BackendConfigSchema)
        .mutation(({ input }) => {
            const success = saveBackendConfig(input)
            if (!success) {
                throw new Error("Failed to write configuration file to disk.")
            }
            return { success: true }
        }),
})
