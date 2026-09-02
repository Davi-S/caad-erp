import React from "react"
import { render, screen, act } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { AppConfigProvider, useAppConfig } from "../../src/config/context"
import { DEFAULT_CONFIG } from "../../src/config/defaults"
import { CONFIG_STORAGE_KEY } from "../../src/config/storage"

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

function TestConsumer() {
    const { config, updateConfig, overwriteConfig, resetConfig } = useAppConfig()
    return (
        <div>
            <span data-testid="timeout">{config.autoStartNewSaleTimeoutMs}</span>
            <span data-testid="delimiter">{config.productGroupingDelimiter}</span>
            <button
                type="button"
                onClick={() => updateConfig({ autoStartNewSaleTimeoutMs: 15000 })}
            >
                Update
            </button>
            <button
                type="button"
                onClick={() =>
                    overwriteConfig({
                        autoStartNewSaleTimeoutMs: 25000,
                        productGroupingDelimiter: " / ",
                        pixDescriptionTemplate: "Custom {salesmanName}",
                        excelDefaultFilename: "relatorio.xlsx",
                    })
                }
            >
                Overwrite
            </button>
            <button type="button" onClick={() => resetConfig()}>
                Reset
            </button>
        </div>
    )
}

describe("AppConfigContext and useAppConfig Hook", () => {
    let storageMock: ReturnType<typeof setupLocalStorageMock>

    beforeEach(() => {
        storageMock = setupLocalStorageMock()
    })

    it("GIVEN AppConfigProvider WHEN rendered THEN provides DEFAULT_CONFIG initially", () => {
        render(
            <AppConfigProvider>
                <TestConsumer />
            </AppConfigProvider>,
        )

        expect(screen.getByTestId("timeout").textContent).toBe(
            String(DEFAULT_CONFIG.autoStartNewSaleTimeoutMs),
        )
        expect(screen.getByTestId("delimiter").textContent).toBe(
            DEFAULT_CONFIG.productGroupingDelimiter,
        )
    })

    it("GIVEN consumer calling updateConfig WHEN clicked THEN updates state and storage", () => {
        render(
            <AppConfigProvider>
                <TestConsumer />
            </AppConfigProvider>,
        )

        act(() => {
            screen.getByText("Update").click()
        })

        expect(screen.getByTestId("timeout").textContent).toBe("15000")
        expect(storageMock.getItem(CONFIG_STORAGE_KEY)).toContain("15000")
    })

    it("GIVEN consumer calling overwriteConfig WHEN clicked THEN replaces state and storage", () => {
        render(
            <AppConfigProvider>
                <TestConsumer />
            </AppConfigProvider>,
        )

        act(() => {
            screen.getByText("Overwrite").click()
        })

        expect(screen.getByTestId("timeout").textContent).toBe("25000")
        expect(screen.getByTestId("delimiter").textContent).toBe(" / ")
    })

    it("GIVEN custom state WHEN reset button is clicked THEN reverts to DEFAULT_CONFIG", () => {
        render(
            <AppConfigProvider>
                <TestConsumer />
            </AppConfigProvider>,
        )

        act(() => {
            screen.getByText("Update").click()
        })
        expect(screen.getByTestId("timeout").textContent).toBe("15000")

        act(() => {
            screen.getByText("Reset").click()
        })
        expect(screen.getByTestId("timeout").textContent).toBe(
            String(DEFAULT_CONFIG.autoStartNewSaleTimeoutMs),
        )
    })

    it("GIVEN storage event from another window WHEN received THEN synchronizes config state", () => {
        render(
            <AppConfigProvider>
                <TestConsumer />
            </AppConfigProvider>,
        )

        act(() => {
            storageMock.setItem(
                CONFIG_STORAGE_KEY,
                JSON.stringify({ autoStartNewSaleTimeoutMs: 33000 }),
            )
            window.dispatchEvent(
                new StorageEvent("storage", {
                    key: CONFIG_STORAGE_KEY,
                }),
            )
        })

        expect(screen.getByTestId("timeout").textContent).toBe("33000")
    })

    it("GIVEN useAppConfig outside provider WHEN rendered THEN returns safe fallback", () => {
        render(<TestConsumer />)
        expect(screen.getByTestId("timeout").textContent).toBe(
            String(DEFAULT_CONFIG.autoStartNewSaleTimeoutMs),
        )
    })
})
