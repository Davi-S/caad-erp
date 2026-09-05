import { TRPCError } from "@trpc/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTestCaller } from "./setup.js"
import { saveBackendConfig } from "../../src/config.js"

vi.mock("../../src/config.js", () => {
    let mockStore = {
        mercadoPagoAccessToken: "TOKEN_123",
        mercadoPagoPayerEmail: "old@test.com",
    }
    return {
        BackendConfigSchema: vi.fn(), // Not needed for the mock itself
        getBackendConfig: vi.fn(() => ({ ...mockStore })),
        saveBackendConfig: vi.fn((newConfig) => {
            if (newConfig.mercadoPagoPayerEmail === "FAIL") return false
            mockStore = { ...mockStore, ...newConfig }
            return true
        }),
    }
})

describe("Settings Router Procedures", () => {
    let caller: ReturnType<typeof createTestCaller>["caller"]

    beforeEach(() => {
        const testSetup = createTestCaller()
        caller = testSetup.caller
        vi.clearAllMocks()
    })

    it("GIVEN active server WHEN settings.getBackendConfig is called THEN returns config without raw token", async () => {
        const res = await caller.settings.getBackendConfig()
        expect(res).toEqual({
            mercadoPagoPayerEmail: "old@test.com",
            hasAccessToken: true,
        })
        expect((res as any).mercadoPagoAccessToken).toBeUndefined()
    })

    it("GIVEN valid payload with undefined token WHEN settings.updateBackendConfig is called THEN updates email but preserves token", async () => {
        const res = await caller.settings.updateBackendConfig({
            mercadoPagoPayerEmail: "new@test.com",
            mercadoPagoAccessToken: undefined,
        })
        expect(res.success).toBe(true)
        expect(saveBackendConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                mercadoPagoAccessToken: "TOKEN_123",
                mercadoPagoPayerEmail: "new@test.com",
            }),
        )
    })

    it("GIVEN valid payload with new token WHEN settings.updateBackendConfig is called THEN updates both token and email", async () => {
        const res = await caller.settings.updateBackendConfig({
            mercadoPagoPayerEmail: "new2@test.com",
            mercadoPagoAccessToken: "TOKEN_456",
        })
        expect(res.success).toBe(true)
        expect(saveBackendConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                mercadoPagoAccessToken: "TOKEN_456",
                mercadoPagoPayerEmail: "new2@test.com",
            }),
        )
    })

    it("GIVEN saveBackendConfig returns false WHEN settings.updateBackendConfig is called THEN throws TRPCError", async () => {
        try {
            await caller.settings.updateBackendConfig({
                mercadoPagoPayerEmail: "FAIL", // triggers the mock to return false
            })
            expect.unreachable("Should have thrown TRPCError")
        } catch (err) {
            expect(err).toBeInstanceOf(TRPCError)
            expect((err as TRPCError).message).toContain("Failed to write configuration")
        }
    })
})
