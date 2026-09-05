import { publicProcedure, router } from "../trpc.js"
import { BackendConfigSchema, getBackendConfig, saveBackendConfig } from "../../config.js"

export const settingsRouter = router({
    getBackendConfig: publicProcedure.query(() => {
        return getBackendConfig()
    }),
    updateBackendConfig: publicProcedure
        .input(BackendConfigSchema)
        .mutation(({ input }) => {
            saveBackendConfig(input)
            return { success: true }
        }),
})
