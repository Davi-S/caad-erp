import type { AppConfig } from "./types"
import { DEFAULT_CONFIG } from "./defaults"
import { sanitizeConfig, validateConfig } from "./helpers"

export const CONFIG_STORAGE_KEY = "caad_erp_config_v1"

// Loads configuration from localStorage, safely falling back to defaults.
export function loadConfig(): AppConfig {
    if (typeof window === "undefined" || !window.localStorage) {
        return { ...DEFAULT_CONFIG }
    }

    try {
        const stored = window.localStorage.getItem(CONFIG_STORAGE_KEY)
        if (!stored) {
            return { ...DEFAULT_CONFIG }
        }
        const parsed = JSON.parse(stored)
        return sanitizeConfig(parsed)
    } catch {
        return { ...DEFAULT_CONFIG }
    }
}

// Saves a partial configuration patch to localStorage and returns the merged config.
export function saveConfig(patch: Partial<AppConfig>): AppConfig {
    if (typeof window === "undefined" || !window.localStorage) {
        return { ...DEFAULT_CONFIG, ...validateConfig(patch) }
    }

    try {
        const current = loadConfig()
        const validatedPatch = validateConfig(patch)
        const updated: AppConfig = {
            ...current,
            ...validatedPatch,
        }
        window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated))
        return updated
    } catch {
        return loadConfig()
    }
}

// Replaces the entire active configuration in localStorage.
export function overwriteConfig(newConfig: AppConfig): AppConfig {
    if (typeof window === "undefined" || !window.localStorage) {
        return sanitizeConfig(newConfig)
    }

    try {
        const sanitized = sanitizeConfig(newConfig)
        window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(sanitized))
        return sanitized
    } catch {
        return loadConfig()
    }
}

// Removes custom configuration from localStorage and restores default values.
export function resetConfig(): AppConfig {
    if (typeof window !== "undefined" && window.localStorage) {
        try {
            window.localStorage.removeItem(CONFIG_STORAGE_KEY)
        } catch {
            // Ignore storage removal error
        }
    }
    return { ...DEFAULT_CONFIG }
}
