/**
 * Unit test suite for POS Sales Assembly and Notes Formatting.
 */

import { describe, expect, it } from "vitest"
import { formatSaleNotes, assemblySalesRequest } from "../src/features/pos/index"
import { brl } from "@/helpers"

describe("formatSaleNotes", () => {
    it("GIVEN only manual notes WHEN formatSaleNotes is called THEN returns trimmed manual note", () => {
        expect(formatSaleNotes("  Venda retroativa 25/08  ", 0, 0)).toBe("Venda retroativa 25/08")
    })

    it("GIVEN only discount WHEN formatSaleNotes is called THEN returns discount audit note", () => {
        expect(formatSaleNotes("", 500, 250)).toBe(
            `Desconto global de ${brl(500)} aplicado (Desc. proporcional do item: ${brl(250)})`,
        )
    })

    it("GIVEN both manual note and discount WHEN formatSaleNotes is called THEN returns combined note with pipe separator", () => {
        const result = formatSaleNotes("Venda de evento", 1000, 500)
        expect(result).toBe(
            `Desconto global de ${brl(1000)} aplicado (Desc. proporcional do item: ${brl(500)}) | Venda de evento`,
        )
    })

    it("GIVEN neither manual note nor discount WHEN formatSaleNotes is called THEN returns null", () => {
        expect(formatSaleNotes("", 0, 0)).toBeNull()
        expect(formatSaleNotes("   ", 0, 0)).toBeNull()
    })
})

describe("assemblySalesRequest", () => {
    it("GIVEN cart with manual note and discount WHEN assemblySalesRequest is called THEN builds transactions with combined notes", () => {
        const cartState = {
            itemsList: [
                { productId: "P1", name: "Refrigerante", unitPrice: 500, quantity: 2, discount: 0 },
                { productId: "P2", name: "Salgado", unitPrice: 1000, quantity: 1, discount: 0 },
            ],
            discount: 200, // R$ 2,00 total discount (R$ 1,00 each)
            notes: "Venda teste retroativa",
        }

        const requests = assemblySalesRequest("S1", "PIX", cartState)

        expect(requests).toHaveLength(2)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 2,
            totalRevenue: 900, // 1000 - 100
            paymentType: "PIX",
            notes: `Desconto global de ${brl(200)} aplicado (Desc. proporcional do item: ${brl(100)}) | Venda teste retroativa`,
        })
        expect(requests[1]).toEqual({
            productId: "P2",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 900, // 1000 - 100
            paymentType: "PIX",
            notes: `Desconto global de ${brl(200)} aplicado (Desc. proporcional do item: ${brl(100)}) | Venda teste retroativa`,
        })
    })

    it("GIVEN cart with 100% discount WHEN assemblySalesRequest is called with PIX THEN sets paymentType to Other for zero-revenue items", () => {
        const cartState = {
            itemsList: [
                { productId: "P1", name: "Refrigerante", unitPrice: 500, quantity: 1, discount: 0 },
            ],
            discount: 500, // 100% global discount
            notes: "Brinde",
        }

        const requests = assemblySalesRequest("S1", "PIX", cartState)

        expect(requests).toHaveLength(1)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 0,
            paymentType: "Other",
            notes: `Desconto global de ${brl(500)} aplicado (Desc. proporcional do item: ${brl(500)}) | Brinde`,
        })
    })

    it("GIVEN mixed cart where one item has zero revenue WHEN assemblySalesRequest is called with PIX THEN sets paymentType to Other only for zero-revenue item", () => {
        const cartState = {
            itemsList: [
                { productId: "P1", name: "Refrigerante", unitPrice: 500, quantity: 1, discount: 0 },
                { productId: "P3", name: "Brinde Adesivo", unitPrice: 0, quantity: 1, discount: 0 },
            ],
            discount: 0,
            notes: "",
        }

        const requests = assemblySalesRequest("S1", "PIX", cartState)

        expect(requests).toHaveLength(2)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 500,
            paymentType: "PIX",
            notes: null,
        })
        expect(requests[1]).toEqual({
            productId: "P3",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 0,
            paymentType: "Other",
            notes: null,
        })
    })

    it("GIVEN cart paid with Other WHEN assemblySalesRequest is called THEN sets paymentType to Other", () => {
        const cartState = {
            itemsList: [
                { productId: "P1", name: "Refrigerante", unitPrice: 500, quantity: 1, discount: 0 },
            ],
            discount: 0,
            notes: "",
        }

        const requests = assemblySalesRequest("S1", "Other", cartState)

        expect(requests).toHaveLength(1)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 500,
            paymentType: "Other",
            notes: null,
        })
    })

    it("GIVEN OnCredit sale WHEN assemblySalesRequest is called THEN preserves OnCredit paymentType and 0 revenue", () => {
        const cartState = {
            itemsList: [
                { productId: "P1", name: "Refrigerante", unitPrice: 500, quantity: 1, discount: 0 },
            ],
            discount: 0,
            notes: "Fiado",
        }

        const requests = assemblySalesRequest("S1", "OnCredit", cartState)

        expect(requests).toHaveLength(1)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 0,
            paymentType: "OnCredit",
            notes: "Fiado",
        })
    })
})
