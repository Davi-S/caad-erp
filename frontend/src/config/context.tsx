import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { AppConfig } from "./types"
import { DEFAULT_CONFIG } from "./defaults"
import {
    CONFIG_STORAGE_KEY,
    loadConfig,
    saveConfig as persistConfig,
    overwriteConfig as persistOverwriteConfig,
    resetConfig as persistResetConfig,
} from "./storage"

export interface AppConfigContextValue {
    config: AppConfig
    updateConfig: (patch: Partial<AppConfig>) => void
    overwriteConfig: (newConfig: AppConfig) => void
    resetConfig: () => void
}

const AppConfigContext = createContext<AppConfigContextValue | null>(null)

export function AppConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<AppConfig>(loadConfig)

    // Listen to changes from other browser tabs / windows (e.g. Customer Display window)
    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === CONFIG_STORAGE_KEY) {
                setConfig(loadConfig())
            }
        }

        window.addEventListener("storage", handleStorageChange)
        return () => {
            window.removeEventListener("storage", handleStorageChange)
        }
    }, [])

    const updateConfig = useCallback((patch: Partial<AppConfig>) => {
        const updated = persistConfig(patch)
        setConfig(updated)
    }, [])

    const overwriteConfig = useCallback((newConfig: AppConfig) => {
        const updated = persistOverwriteConfig(newConfig)
        setConfig(updated)
    }, [])

    const resetConfig = useCallback(() => {
        const reset = persistResetConfig()
        setConfig(reset)
    }, [])

    return (
        <AppConfigContext.Provider
            value={{
                config,
                updateConfig,
                overwriteConfig,
                resetConfig,
            }}
        >
            {children}
        </AppConfigContext.Provider>
    )
}

// Custom hook to consume the active application configuration.
export function useAppConfig(): AppConfigContextValue {
    const context = useContext(AppConfigContext)
    if (!context) {
        // Fallback for tests or unmounted context
        return {
            config: DEFAULT_CONFIG,
            updateConfig: () => {},
            overwriteConfig: () => {},
            resetConfig: () => {},
        }
    }
    return context
}
