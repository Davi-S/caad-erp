import fs from "fs"
import path from "path"
import { z } from "zod"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const BackendConfigSchema = z.object({
    mercadoPagoAccessToken: z.string().optional(),
    mercadoPagoPayerEmail: z.string().default("cliente@caad.com.br"),
})
export type BackendConfig = z.infer<typeof BackendConfigSchema>

// The conf file lives in the backend root directory
const CONFIG_PATH = path.resolve(__dirname, "../caad_erp.conf.json")

export function getBackendConfig(): BackendConfig {
    if (!fs.existsSync(CONFIG_PATH)) {
        return BackendConfigSchema.parse({})
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8")
    try {
        const parsed = JSON.parse(raw)
        return BackendConfigSchema.parse(parsed)
    } catch {
        return BackendConfigSchema.parse({})
    }
}

export function saveBackendConfig(config: BackendConfig): boolean {
    const validConfig = BackendConfigSchema.parse(config)
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(validConfig, null, 4), "utf-8")
        return true
    } catch (err) {
        console.error("Failed to save backend config:", err)
        return false
    }
}
