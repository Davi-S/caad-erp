/**
 * Unit test suite for POS Sales Assembly and Notes Formatting with Per-Item Discounts.
 */

import { describe, expect, it } from "vitest"
import { formatSaleNotes, assemblySalesRequest } from "../src/features/pos/index"
import { brl } from "@/helpers"

describe("formatSaleNotes", () => {
    it("GIVEN only manual notes WHEN formatSaleNotes is called THEN returns trimmed manual note", () => {
        expect(formatSaleNotes("  Venda retroativa 25/08  ", 0, 0, 0)).toBe(
            "Venda retroativa 25/08",
        )
    })

    it("GIVEN only global discount WHEN formatSaleNotes is called THEN returns global discount audit note", () => {
        expect(formatSaleNotes("", 500, 250, 0)).toBe(
            `Desconto global de ${brl(500)} aplicado (Desc. proporcional do item: ${brl(250)})`,
        )
    })

    it("GIVEN only item discount WHEN formatSaleNotes is called THEN returns item discount audit note", () => {
        expect(formatSaleNotes("", 0, 0, 300)).toBe(`Desconto no item de ${brl(300)}`)
    })

    it("GIVEN both item discount and global discount WHEN formatSaleNotes is called THEN returns combined discount note", () => {
        expect(formatSaleNotes("", 1000, 400, 300)).toBe(
            `Desconto no item de ${brl(300)} | Desconto global de ${brl(1000)} aplicado (Desc. proporcional do item: ${brl(400)})`,
        )
    })

    it("GIVEN item discount, global discount, and manual notes WHEN formatSaleNotes is called THEN returns all three joined by pipe", () => {
        const result = formatSaleNotes("Cliente VIP", 1000, 400, 300)
        expect(result).toBe(
            `Desconto no item de ${brl(300)} | Desconto global de ${brl(1000)} aplicado (Desc. proporcional do item: ${brl(400)}) | Cliente VIP`,
        )
    })

    it("GIVEN no discounts and no notes WHEN formatSaleNotes is called THEN returns null", () => {
        expect(formatSaleNotes("", 0, 0, 0)).toBeNull()
        expect(formatSaleNotes("   ", 0, 0, 0)).toBeNull()
    })
})

describe("assemblySalesRequest", () => {
    it("GIVEN cart with per-item discounts only WHEN assemblySalesRequest is called THEN computes revenue and item discount note", () => {
        const cartState = {
            itemsList: [
                {
                    productId: "P1",
                    name: "Refrigerante",
                    unitPrice: 500,
                    quantity: 2,
                    discount: 200,
                }, // Gross: 1000, Disc: 200, Rev: 800
                { productId: "P2", name: "Salgado", unitPrice: 800, quantity: 1, discount: 100 }, // Gross: 800, Disc: 100, Rev: 700
            ],
            discount: 0,
            notes: "",
        }

        const requests = assemblySalesRequest("S1", "PIX", cartState)

        expect(requests).toHaveLength(2)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 2,
            totalRevenue: 800,
            paymentType: "PIX",
            notes: `Desconto no item de ${brl(200)}`,
        })
        expect(requests[1]).toEqual({
            productId: "P2",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 700,
            paymentType: "PIX",
            notes: `Desconto no item de ${brl(100)}`,
        })
    })

    it("GIVEN cart with both per-item discounts and global discount WHEN assemblySalesRequest is called THEN distributes global discount based on net subtotals", () => {
        // P1 net: 2 * 500 - 200 = 800
        // P2 net: 1 * 1200 - 400 = 800
        // Net Cart Subtotal = 1600
        // Global Discount = 400 (R$ 4,00) -> 200 each
        const cartState = {
            itemsList: [
                {
                    productId: "P1",
                    name: "Refrigerante",
                    unitPrice: 500,
                    quantity: 2,
                    discount: 200,
                },
                { productId: "P2", name: "Bolo", unitPrice: 1200, quantity: 1, discount: 400 },
            ],
            discount: 400,
            notes: "Promoção de Sexta",
        }

        const requests = assemblySalesRequest("S1", "PIX", cartState)

        expect(requests).toHaveLength(2)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 2,
            totalRevenue: 600, // 800 - 200
            paymentType: "PIX",
            notes: `Desconto no item de ${brl(200)} | Desconto global de ${brl(400)} aplicado (Desc. proporcional do item: ${brl(200)}) | Promoção de Sexta`,
        })
        expect(requests[1]).toEqual({
            productId: "P2",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 600, // 800 - 200
            paymentType: "PIX",
            notes: `Desconto no item de ${brl(400)} | Desconto global de ${brl(400)} aplicado (Desc. proporcional do item: ${brl(200)}) | Promoção de Sexta`,
        })
    })

    it("GIVEN item with 100% item discount WHEN assemblySalesRequest is called with PIX THEN assigns paymentType Other to that item", () => {
        const cartState = {
            itemsList: [
                {
                    productId: "P1",
                    name: "Refrigerante",
                    unitPrice: 500,
                    quantity: 1,
                    discount: 500,
                }, // 100% item discount -> Rev 0
                { productId: "P2", name: "Salgado", unitPrice: 800, quantity: 1, discount: 0 }, // Full price -> Rev 800
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
            totalRevenue: 0,
            paymentType: "Other",
            notes: `Desconto no item de ${brl(500)}`,
        })
        expect(requests[1]).toEqual({
            productId: "P2",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 800,
            paymentType: "PIX",
            notes: null,
        })
    })

    it("GIVEN cart with 100% global discount WHEN assemblySalesRequest is called with PIX THEN sets paymentType to Other for zero-revenue items", () => {
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

    it("GIVEN mixed cart where one item has zero unitPrice WHEN assemblySalesRequest is called with PIX THEN sets paymentType to Other only for zero-revenue item", () => {
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

    it("GIVEN OnCredit sale with item and global discounts WHEN assemblySalesRequest is called THEN preserves OnCredit paymentType and 0 revenue", () => {
        const cartState = {
            itemsList: [
                {
                    productId: "P1",
                    name: "Refrigerante",
                    unitPrice: 500,
                    quantity: 1,
                    discount: 100,
                },
            ],
            discount: 100,
            notes: "Fiado para João",
        }

        const requests = assemblySalesRequest("S1", "OnCredit", cartState)

        expect(requests).toHaveLength(1)
        expect(requests[0]).toEqual({
            productId: "P1",
            salesmanId: "S1",
            quantity: 1,
            totalRevenue: 0,
            paymentType: "OnCredit",
            notes: `Desconto no item de ${brl(100)} | Desconto global de ${brl(100)} aplicado (Desc. proporcional do item: ${brl(100)}) | Fiado para João`,
        })
    })
})
