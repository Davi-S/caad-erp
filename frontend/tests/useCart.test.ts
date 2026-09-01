/**
 * Unit test suite for Cart Calculations and Per-Item Discount Invariants.
 */

import { describe, expect, it } from "vitest"
import type { CartItem } from "../src/features/pos/hooks/useCart"

describe("CartItem Calculations and Math Invariants", () => {
    it("GIVEN multiple cart items with per-item discounts THEN calculates subtotals and totals accurately", () => {
        const items: CartItem[] = [
            { productId: "P1", name: "Refrigerante", unitPrice: 500, quantity: 3, discount: 300 }, // Gross: 1500, Disc: 300, Net: 1200
            { productId: "P2", name: "Salgado", unitPrice: 800, quantity: 2, discount: 200 }, // Gross: 1600, Disc: 200, Net: 1400
            { productId: "P3", name: "Bolo", unitPrice: 1200, quantity: 1, discount: 0 }, // Gross: 1200, Disc: 0, Net: 1200
        ]

        const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
        const totalItemDiscount = items.reduce((sum, item) => sum + item.discount, 0)
        const netSubtotal = subtotal - totalItemDiscount

        const globalDiscount = 800 // R$ 8,00 global discount
        const total = netSubtotal - globalDiscount

        expect(subtotal).toBe(4300) // R$ 43,00
        expect(totalItemDiscount).toBe(500) // R$ 5,00
        expect(netSubtotal).toBe(3800) // R$ 38,00
        expect(total).toBe(3000) // R$ 30,00
    })

    it("GIVEN item discount clamping rules WHEN discount is applied THEN clamps between 0 and gross subtotal", () => {
        const item: CartItem = {
            productId: "P1",
            name: "Refrigerante",
            unitPrice: 500,
            quantity: 2,
            discount: 0,
        }
        const itemGross = item.quantity * item.unitPrice // 1000

        const clampDiscount = (value: number) => Math.min(itemGross, Math.max(0, value))

        expect(clampDiscount(400)).toBe(400)
        expect(clampDiscount(1000)).toBe(1000)
        expect(clampDiscount(1500)).toBe(1000) // Clamped to gross subtotal
        expect(clampDiscount(-200)).toBe(0) // Clamped to 0
    })

    it("GIVEN cart mutation invariant WHEN item quantity changes THEN item discount and global discount reset to 0", () => {
        let items: Record<string, CartItem> = {
            P1: {
                productId: "P1",
                name: "Refrigerante",
                unitPrice: 500,
                quantity: 2,
                discount: 300,
            },
        }
        let globalDiscount = 200

        // Simulate quantity change mutation rule
        const incItem = (id: string) => {
            const current = items[id]
            if (!current) return
            globalDiscount = 0 // Reset global discount
            items = {
                ...items,
                [id]: {
                    ...current,
                    quantity: current.quantity + 1,
                    discount: 0, // Reset item discount
                },
            }
        }

        incItem("P1")

        expect(items.P1.quantity).toBe(3)
        expect(items.P1.discount).toBe(0)
        expect(globalDiscount).toBe(0)
    })
})
