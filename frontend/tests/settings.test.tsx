import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { MantineProvider } from "@mantine/core"
import { SettingsPage } from "../src/features/settings"
import { AppConfigProvider } from "../src/config/context"
import { DEFAULT_CONFIG } from "../src/config/defaults"
import { CONFIG_STORAGE_KEY } from "../src/config/storage"

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

function renderSettingsPage() {
    return render(
        <MemoryRouter>
            <MantineProvider>
                <AppConfigProvider>
                    <SettingsPage />
                </AppConfigProvider>
            </MantineProvider>
        </MemoryRouter>,
    )
}

describe("SettingsPage Component", () => {
    let storageMock: ReturnType<typeof setupLocalStorageMock>

    beforeEach(() => {
        storageMock = setupLocalStorageMock()
    })

    it("GIVEN default config WHEN rendered THEN populates form fields with default values", () => {
        renderSettingsPage()

        const timeoutInput = screen.getByLabelText(
            /Tempo para Nova Venda Automática/i,
        ) as HTMLInputElement
        const delimiterInput = screen.getByLabelText(
            /Separador de Variações de Produto/i,
        ) as HTMLInputElement
        const pixInput = screen.getByLabelText(/Modelo de Descrição do PIX/i) as HTMLInputElement
        const excelInput = screen.getByLabelText(
            /Nome Padrão do Arquivo Excel/i,
        ) as HTMLInputElement

        expect(timeoutInput.value).toBe(`${DEFAULT_CONFIG.autoStartNewSaleTimeoutMs / 1000} s`)
        expect(delimiterInput.value).toBe(DEFAULT_CONFIG.productGroupingDelimiter)
        expect(pixInput.value).toBe(DEFAULT_CONFIG.pixDescriptionTemplate)
        expect(excelInput.value).toBe(DEFAULT_CONFIG.excelDefaultFilename)
    })

    it("GIVEN modified fields WHEN Salvar Alterações is clicked THEN saves to config and shows success alert", async () => {
        renderSettingsPage()

        const delimiterInput = screen.getByLabelText(/Separador de Variações de Produto/i)
        const pixInput = screen.getByLabelText(/Modelo de Descrição do PIX/i)
        const excelInput = screen.getByLabelText(/Nome Padrão do Arquivo Excel/i)
        const saveButton = screen.getByRole("button", { name: /Salvar Alterações/i })

        fireEvent.change(delimiterInput, { target: { value: " / " } })
        fireEvent.change(pixInput, { target: { value: "Pedido #{salesmanName}" } })
        fireEvent.change(excelInput, { target: { value: "relatorio_caad.xlsx" } })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(screen.getByText(/Configurações salvas com sucesso!/i)).toBeDefined()
        })

        const stored = JSON.parse(storageMock.getItem(CONFIG_STORAGE_KEY) as string)
        expect(stored.productGroupingDelimiter).toBe(" / ")
        expect(stored.pixDescriptionTemplate).toBe("Pedido #{salesmanName}")
        expect(stored.excelDefaultFilename).toBe("relatorio_caad.xlsx")
    })

    it("GIVEN modified form WHEN Restaurar Padrões is clicked THEN resets values and storage", async () => {
        storageMock.setItem(
            CONFIG_STORAGE_KEY,
            JSON.stringify({
                autoStartNewSaleTimeoutMs: 10000,
                productGroupingDelimiter: " | ",
            }),
        )

        renderSettingsPage()

        const resetButton = screen.getByRole("button", { name: /Restaurar Padrões/i })
        fireEvent.click(resetButton)

        await waitFor(() => {
            expect(screen.getByText(/Configurações restauradas para os padrões/i)).toBeDefined()
        })

        const delimiterInput = screen.getByLabelText(
            /Separador de Variações de Produto/i,
        ) as HTMLInputElement
        expect(delimiterInput.value).toBe(DEFAULT_CONFIG.productGroupingDelimiter)
    })

    it("GIVEN export button WHEN clicked THEN creates download link", () => {
        const createObjectURLMock = vi.fn(() => "blob:http://localhost/blob-url")
        const revokeObjectURLMock = vi.fn()
        window.URL.createObjectURL = createObjectURLMock
        window.URL.revokeObjectURL = revokeObjectURLMock

        renderSettingsPage()

        const exportButton = screen.getByRole("button", { name: /Exportar Arquivo/i })
        fireEvent.click(exportButton)

        expect(createObjectURLMock).toHaveBeenCalled()
        expect(revokeObjectURLMock).toHaveBeenCalled()
    })

    it("GIVEN salesmanName badge WHEN clicked THEN appends tag to PIX template input", () => {
        renderSettingsPage()

        const pixInput = screen.getByLabelText(/Modelo de Descrição do PIX/i) as HTMLInputElement
        fireEvent.change(pixInput, { target: { value: "Cobrança Caixa" } })

        const badge = screen.getByText("{salesmanName}")
        fireEvent.click(badge)

        expect(pixInput.value).toBe("Cobrança Caixa {salesmanName}")
    })
})
