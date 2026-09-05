import { describe, expect, it, vi } from "vitest"
import {
    formatPixDescription,
    validateConfig,
    sanitizeConfig,
    exportConfigAsJson,
    parseConfigFile,
} from "../../src/config/helpers"
import { DEFAULT_CONFIG } from "../../src/config/defaults"

describe("Configuration Helpers", () => {
    describe("formatPixDescription", () => {
        it("GIVEN default template WHEN formatted with salesman THEN replaces placeholder", () => {
            const result = formatPixDescription("Venda - {salesmanName}", {
                salesmanName: "Davi",
            })
            expect(result).toBe("Venda - Davi")
        })

        it("GIVEN custom template with {salesmanName} placeholder WHEN formatted THEN replaces correctly", () => {
            const result = formatPixDescription("Pedido Loja ({salesmanName})", {
                salesmanName: "Carlos",
            })
            expect(result).toBe("Pedido Loja (Carlos)")
        })

        it("GIVEN empty salesman WHEN formatted THEN cleans trailing hyphen gracefully", () => {
            const result = formatPixDescription("Venda - {salesmanName}", {
                salesmanName: "",
            })
            expect(result).toBe("Venda")
        })

        it("GIVEN null or undefined salesman WHEN formatted THEN cleans gracefully", () => {
            const result = formatPixDescription("Venda - {salesmanName}", {
                salesmanName: null,
            })
            expect(result).toBe("Venda")
        })

        it("GIVEN empty template WHEN formatted THEN uses default fallback", () => {
            const result = formatPixDescription("", { salesmanName: "Ana" })
            expect(result).toBe("Venda - Ana")
        })
    })

    describe("validateConfig", () => {
        it("GIVEN valid partial config WHEN validated THEN extracts correct properties", () => {
            const input = {
                autoStartNewSaleTimeoutMs: 15000,
                productGroupingDelimiter: " / ",
                pixDescriptionTemplate: "Caixa - {salesmanName}",
                excelDefaultFilename: "planilha.xlsx",
            }
            const validated = validateConfig(input)
            expect(validated).toEqual({
                autoStartNewSaleTimeoutMs: 15000,
                productGroupingDelimiter: " / ",
                pixDescriptionTemplate: "Caixa - {salesmanName}",
                excelDefaultFilename: "planilha.xlsx",
            })
        })

        it("GIVEN invalid types and negative numbers WHEN validated THEN ignores invalid fields", () => {
            const input = {
                autoStartNewSaleTimeoutMs: -500,
                productGroupingDelimiter: 123,
                pixDescriptionTemplate: "",
                excelDefaultFilename: "   ",
                extraField: "ignored",
            }
            const validated = validateConfig(input)
            expect(validated).toEqual({})
        })

        it("GIVEN non-object input WHEN validated THEN returns empty object", () => {
            expect(validateConfig(null)).toEqual({})
            expect(validateConfig(undefined)).toEqual({})
            expect(validateConfig("string")).toEqual({})
            expect(validateConfig([1, 2, 3])).toEqual({})
        })

        it("GIVEN float timeout WHEN validated THEN floors to integer", () => {
            const validated = validateConfig({ autoStartNewSaleTimeoutMs: 4500.8 })
            expect(validated.autoStartNewSaleTimeoutMs).toBe(4500)
        })
    })

    describe("sanitizeConfig", () => {
        it("GIVEN empty or partial input WHEN sanitized THEN merges with DEFAULT_CONFIG", () => {
            const sanitized = sanitizeConfig({ autoStartNewSaleTimeoutMs: 10000 })
            expect(sanitized).toEqual({
                ...DEFAULT_CONFIG,
                autoStartNewSaleTimeoutMs: 10000,
            })
        })

        it("GIVEN totally invalid input WHEN sanitized THEN returns full DEFAULT_CONFIG", () => {
            const sanitized = sanitizeConfig(null)
            expect(sanitized).toEqual(DEFAULT_CONFIG)
        })
    })

    describe("exportConfigAsJson", () => {
        it("GIVEN config object WHEN exportConfigAsJson is called THEN creates and triggers download link", () => {
            const createObjectURLMock = vi.fn(() => "blob:http://localhost/mock-blob")
            const revokeObjectURLMock = vi.fn()
            window.URL.createObjectURL = createObjectURLMock
            window.URL.revokeObjectURL = revokeObjectURLMock

            const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click")

            exportConfigAsJson(DEFAULT_CONFIG, "test_config.json")

            expect(createObjectURLMock).toHaveBeenCalled()
            expect(clickSpy).toHaveBeenCalled()
            expect(revokeObjectURLMock).toHaveBeenCalled()
        })
    })

    describe("parseConfigFile", () => {
        it("GIVEN valid JSON file WHEN parseConfigFile is called THEN parses and returns config", async () => {
            const validJson = JSON.stringify({
                autoStartNewSaleTimeoutMs: 20000,
                productGroupingDelimiter: " : ",
            })
            const file = new File([validJson], "config.json", { type: "application/json" })

            const config = await parseConfigFile(file)
            expect(config.autoStartNewSaleTimeoutMs).toBe(20000)
            expect(config.productGroupingDelimiter).toBe(" : ")
            expect(config.excelDefaultFilename).toBe(DEFAULT_CONFIG.excelDefaultFilename)
        })

        it("GIVEN malformed JSON file WHEN parseConfigFile is called THEN throws error", async () => {
            const file = new File(["{ invalid json"], "bad.json", {
                type: "application/json",
            })
            await expect(parseConfigFile(file)).rejects.toThrow("Arquivo de configuração inválido")
        })

        it("GIVEN non-object JSON file WHEN parseConfigFile is called THEN throws format error", async () => {
            const file = new File(['"just a string"'], "string.json", {
                type: "application/json",
            })
            await expect(parseConfigFile(file)).rejects.toThrow("Formato de arquivo inválido")
        })
    })
})
