/**
 * Unit test suite for Distribute Discount (Cumulative Running Balance Penny Allocation).
 */

import { describe, expect, it } from "vitest"
import { distributeDiscount } from "../src/features/pos/utils/discount"

describe("distributeDiscount (Cumulative Running Balance)", () => {
    it("GIVEN zero discount or empty items WHEN distributeDiscount is called THEN returns zero mappings", () => {
        expect(distributeDiscount([], 0)).toEqual({})
        expect(
            distributeDiscount(
                [
                    { productId: "P1", subtotal: 1000 },
                    { productId: "P2", subtotal: 2000 },
                ],
                0,
            ),
        ).toEqual({ P1: 0, P2: 0 })
    })

    it("GIVEN 3 identical items with R$ 1,00 (100c) discount WHEN distributed THEN exact sum is 100c with 0 drift", () => {
        const items = [
            { productId: "P1", subtotal: 1000 },
            { productId: "P2", subtotal: 1000 },
            { productId: "P3", subtotal: 1000 },
        ]
        const result = distributeDiscount(items, 100)

        expect(result.P1).toBe(33)
        expect(result.P2).toBe(34)
        expect(result.P3).toBe(33)

        const totalDistributed = Object.values(result).reduce((a, b) => a + b, 0)
        expect(totalDistributed).toBe(100)
    })

    it("GIVEN items with varying prices WHEN distributed THEN sum matches total discount exactly", () => {
        const items = [
            { productId: "P1", subtotal: 500 }, // R$ 5,00
            { productId: "P2", subtotal: 1500 }, // R$ 15,00
            { productId: "P3", subtotal: 3000 }, // R$ 30,00
        ] // Total = 5000 (R$ 50,00)

        // 13% discount = 650 cents (R$ 6,50)
        const result = distributeDiscount(items, 650)

        // P1: 500/5000 * 650 = 65
        // P2: 1500/5000 * 650 = 195
        // P3: 3000/5000 * 650 = 390
        expect(result.P1).toBe(65)
        expect(result.P2).toBe(195)
        expect(result.P3).toBe(390)

        const totalDistributed = Object.values(result).reduce((a, b) => a + b, 0)
        expect(totalDistributed).toBe(650)
    })

    it("GIVEN odd cent distribution across 5 items WHEN distributed THEN total discount matches perfectly", () => {
        const items = [
            { productId: "A", subtotal: 333 },
            { productId: "B", subtotal: 777 },
            { productId: "C", subtotal: 1234 },
            { productId: "D", subtotal: 555 },
            { productId: "E", subtotal: 890 },
        ]
        const totalSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
        expect(totalSubtotal).toBe(3789)

        const discount = 437 // Odd cent discount
        const result = distributeDiscount(items, discount)

        const totalDistributed = Object.values(result).reduce((a, b) => a + b, 0)
        expect(totalDistributed).toBe(discount)
    })

    it("GIVEN invalid discount parameters WHEN distributeDiscount is called THEN throws RangeError", () => {
        const items = [
            { productId: "P1", subtotal: 400 },
            { productId: "P2", subtotal: 600 },
        ] // Total subtotal = 1000

        // Negative total discount
        expect(() => distributeDiscount(items, -100)).toThrow(RangeError)

        // Discount > total subtotal
        expect(() => distributeDiscount(items, 1001)).toThrow(RangeError)
    })
})
