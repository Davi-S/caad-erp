import { beforeEach, describe, expect, it } from "vitest"
import {
    CONFIG_STORAGE_KEY,
    loadConfig,
    overwriteConfig,
    resetConfig,
    saveConfig,
} from "../../src/config/storage"
import { DEFAULT_CONFIG } from "../../src/config/defaults"

function setupLocalStorageMock() {
    let store: Record<string, string> = {}
    const mock = {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = String(value)
        },
        removeItem: (key: string) => {
            delete store[key]
        },
        clear: () => {
            store = {}
        },
    }
    Object.defineProperty(window, "localStorage", {
        value: mock,
        writable: true,
        configurable: true,
    })
    return mock
}

describe("Configuration Storage Layer", () => {
    let storageMock: ReturnType<typeof setupLocalStorageMock>

    beforeEach(() => {
        storageMock = setupLocalStorageMock()
    })

    describe("loadConfig", () => {
        it("GIVEN empty localStorage WHEN loadConfig is called THEN returns DEFAULT_CONFIG", () => {
            const config = loadConfig()
            expect(config).toEqual(DEFAULT_CONFIG)
        })

        it("GIVEN saved partial config in localStorage WHEN loadConfig is called THEN merges with defaults", () => {
            storageMock.setItem(
                CONFIG_STORAGE_KEY,
                JSON.stringify({ autoStartNewSaleTimeoutMs: 12000 }),
            )
            const config = loadConfig()
            expect(config.autoStartNewSaleTimeoutMs).toBe(12000)
            expect(config.productGroupingDelimiter).toBe(DEFAULT_CONFIG.productGroupingDelimiter)
        })

        it("GIVEN corrupted JSON in localStorage WHEN loadConfig is called THEN returns DEFAULT_CONFIG gracefully", () => {
            storageMock.setItem(CONFIG_STORAGE_KEY, "invalid-json{{")
            const config = loadConfig()
            expect(config).toEqual(DEFAULT_CONFIG)
        })
    })

    describe("saveConfig", () => {
        it("GIVEN partial patch WHEN saveConfig is called THEN updates localStorage and returns merged config", () => {
            const updated = saveConfig({ autoStartNewSaleTimeoutMs: 45000 })
            expect(updated.autoStartNewSaleTimeoutMs).toBe(45000)
            expect(updated.excelDefaultFilename).toBe(DEFAULT_CONFIG.excelDefaultFilename)

            const rawInStorage = JSON.parse(storageMock.getItem(CONFIG_STORAGE_KEY) as string)
            expect(rawInStorage.autoStartNewSaleTimeoutMs).toBe(45000)
        })
    })

    describe("overwriteConfig", () => {
        it("GIVEN full config object WHEN overwriteConfig is called THEN replaces stored config", () => {
            const custom = {
                autoStartNewSaleTimeoutMs: 10000,
                productGroupingDelimiter: " | ",
                pixDescriptionTemplate: "Loja {salesmanName}",
                excelDefaultFilename: "dados.xlsx",
            }
            const updated = overwriteConfig(custom)
            expect(updated).toEqual(custom)

            const loaded = loadConfig()
            expect(loaded).toEqual(custom)
        })
    })

    describe("resetConfig", () => {
        it("GIVEN custom config in localStorage WHEN resetConfig is called THEN removes key and returns DEFAULT_CONFIG", () => {
            saveConfig({ autoStartNewSaleTimeoutMs: 5000 })
            expect(storageMock.getItem(CONFIG_STORAGE_KEY)).not.toBeNull()

            const reset = resetConfig()
            expect(reset).toEqual(DEFAULT_CONFIG)
            expect(storageMock.getItem(CONFIG_STORAGE_KEY)).toBeNull()
        })
    })
})
