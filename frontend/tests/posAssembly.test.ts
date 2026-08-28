/**
 * Unit test suite for POS Sales Assembly and Notes Formatting.
 */

import { describe, expect, it } from "vitest"
import { formatSaleNotes, assemblySalesRequest } from "../src/features/pos/index"
import { brl } from "@/helpers"
import type { Product } from "@/types"

describe("formatSaleNotes", () => {
    it("GIVEN only manual notes WHEN formatSaleNotes is called THEN returns trimmed manual note", () => {
        expect(formatSaleNotes("  Venda retroativa 25/08  ", 0, 0)).toBe("Venda retroativa 25/08")
    })

    it("GIVEN only discount WHEN formatSaleNotes is called THEN returns discount audit note", () => {
        expect(formatSaleNotes("", 500, 250)).toBe(
            `Desconto global de ${brl(500)} aplicado (Desc. proporcional do item: ${brl(250)})`,
        )
    })

    it("GIVEN both manual note and discount WHEN formatSaleNotes is called THEN returns combined note with bullet separator", () => {
        const result = formatSaleNotes("Venda de evento", 1000, 500)
        expect(result).toBe(
            `Venda de evento • Desconto global de ${brl(1000)} aplicado (Desc. proporcional do item: ${brl(500)})`,
        )
    })

    it("GIVEN neither manual note nor discount WHEN formatSaleNotes is called THEN returns null", () => {
        expect(formatSaleNotes("", 0, 0)).toBeNull()
        expect(formatSaleNotes("   ", 0, 0)).toBeNull()
    })
})

describe("assemblySalesRequest", () => {
    const mockProducts: Product[] = [
        { id: "P1", name: "Refrigerante", sellPrice: 500, isActive: true },
        { id: "P2", name: "Salgado", sellPrice: 1000, isActive: true },
    ]

    it("GIVEN cart with manual note and discount WHEN assemblySalesRequest is called THEN builds transactions with combined notes", () => {
        const cartState = {
            cartIterable: [
                ["P1", 2] as [string, number], // subtotal = 1000 (R$ 10,00)
                ["P2", 1] as [string, number], // subtotal = 1000 (R$ 10,00)
            ],
            discount: 200, // R$ 2,00 total discount (R$ 1,00 each)
            notes: "Venda teste retroativa",
        }

        const requests = assemblySalesRequest("S1", "PIX", cartState, mockProducts)

        expect(requests).toHaveLength(2)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 2,
            totalRevenue: 900, // 1000 - 100
            paymentType: "PIX",
            notes: `Venda teste retroativa • Desconto global de ${brl(200)} aplicado (Desc. proporcional do item: ${brl(100)})`,
        })
        expect(requests[1]).toEqual({
            productId: "P2",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 900, // 1000 - 100
            paymentType: "PIX",
            notes: `Venda teste retroativa • Desconto global de ${brl(200)} aplicado (Desc. proporcional do item: ${brl(100)})`,
        })
    })
})
