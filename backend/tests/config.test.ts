import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "fs"
import { getBackendConfig, saveBackendConfig } from "../src/config.js"

vi.mock("fs", () => {
    return {
        default: {
            existsSync: vi.fn(),
            readFileSync: vi.fn(),
            writeFileSync: vi.fn(),
        },
    }
})

describe("Backend Config Module", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe("getBackendConfig", () => {
        it("returns default config if file does not exist", () => {
            vi.mocked(fs.existsSync).mockReturnValue(false)
            const config = getBackendConfig()
            expect(config).toEqual({
                mercadoPagoPayerEmail: "example@gmail.com",
            })
        })

        it("returns parsed config if file exists", () => {
            vi.mocked(fs.existsSync).mockReturnValue(true)
            vi.mocked(fs.readFileSync).mockReturnValue(
                JSON.stringify({
                    mercadoPagoAccessToken: "TEST_TOKEN",
                    mercadoPagoPayerEmail: "test@domain.com",
                }),
            )
            const config = getBackendConfig()
            expect(config).toEqual({
                mercadoPagoAccessToken: "TEST_TOKEN",
                mercadoPagoPayerEmail: "test@domain.com",
            })
        })

        it("returns default config if file contains invalid JSON", () => {
            vi.mocked(fs.existsSync).mockReturnValue(true)
            vi.mocked(fs.readFileSync).mockReturnValue("INVALID JSON")
            const config = getBackendConfig()
            expect(config).toEqual({
                mercadoPagoPayerEmail: "example@gmail.com",
            })
        })
    })

    describe("saveBackendConfig", () => {
        it("writes valid config to disk and returns true", () => {
            const success = saveBackendConfig({
                mercadoPagoAccessToken: "TOKEN2",
                mercadoPagoPayerEmail: "admin@test.com",
            })
            expect(success).toBe(true)
            expect(fs.writeFileSync).toHaveBeenCalled()
        })

        it("returns false if fs.writeFileSync throws", () => {
            vi.mocked(fs.writeFileSync).mockImplementation(() => {
                throw new Error("Disk error")
            })

            // hide console.error output during test
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

            const success = saveBackendConfig({
                mercadoPagoAccessToken: "TOKEN2",
                mercadoPagoPayerEmail: "admin@test.com",
            })

            expect(success).toBe(false)
            consoleSpy.mockRestore()
        })
    })
})
