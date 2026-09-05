import type { AppConfig } from "./types"
import { DEFAULT_CONFIG } from "./defaults"

// Formats a PIX description string from a template and salesman parameters.
// Replaces {salesmanName} placeholder.
export function formatPixDescription(
    template: string,
    params: { salesmanName?: string | null },
): string {
    const rawSalesman = (params.salesmanName ?? "").trim()
    const tpl = (template || DEFAULT_CONFIG.pixDescriptionTemplate).trim()

    let result = tpl
        .replace(/{salesmanName}/gi, rawSalesman)
        .replace(/\s*-\s*$/, "") // clean up trailing hyphen if salesmanName was empty
        .trim()

    if (!result) {
        result = rawSalesman ? `Venda - ${rawSalesman}` : "Venda"
    }

    return result
}

// Validates unknown data and extracts only valid configuration properties.
export function validateConfig(data: unknown): Partial<AppConfig> {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return {}
    }

    const obj = data as Record<string, unknown>
    const validated: Partial<AppConfig> = {}

    if (
        typeof obj.autoStartNewSaleTimeoutMs === "number" &&
        Number.isFinite(obj.autoStartNewSaleTimeoutMs) &&
        obj.autoStartNewSaleTimeoutMs >= 0
    ) {
        validated.autoStartNewSaleTimeoutMs = Math.floor(obj.autoStartNewSaleTimeoutMs)
    }

    if (typeof obj.productGroupingDelimiter === "string") {
        validated.productGroupingDelimiter = obj.productGroupingDelimiter
    }

    if (
        typeof obj.pixDescriptionTemplate === "string" &&
        obj.pixDescriptionTemplate.trim().length > 0
    ) {
        validated.pixDescriptionTemplate = obj.pixDescriptionTemplate.trim()
    }

    if (
        typeof obj.excelDefaultFilename === "string" &&
        obj.excelDefaultFilename.trim().length > 0
    ) {
        validated.excelDefaultFilename = obj.excelDefaultFilename.trim()
    }

    return validated
}

// Merges raw data onto default configuration, ensuring all properties are valid.
export function sanitizeConfig(raw: unknown): AppConfig {
    const validPatch = validateConfig(raw)
    return {
        ...DEFAULT_CONFIG,
        ...validPatch,
    }
}

// Triggers a browser download for the given AppConfig as a JSON file.
export function exportConfigAsJson(config: AppConfig, filename = "caad_config.json"): void {
    const jsonStr = JSON.stringify(config, null, 2)
    const blob = new Blob([jsonStr], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
}

// Parses and validates a JSON file into an AppConfig object.
export async function parseConfigFile(file: File): Promise<AppConfig> {
    const text = await file.text()
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        throw new Error("Arquivo de configuração inválido. Certifique-se de que é um JSON válido.")
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Formato de arquivo inválido. O conteúdo deve ser um objeto JSON.")
    }

    return sanitizeConfig(parsed)
}
