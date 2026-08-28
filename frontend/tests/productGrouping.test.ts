/**
 * Unit test suite for POS Product Grouping utility.
 */

import { describe, expect, it } from "vitest"
import { groupProducts } from "../src/features/pos/utils/productGrouping"
import type { Product } from "@/types"

describe("groupProducts", () => {
    it("GIVEN list of standalone products WHEN groupProducts is called THEN returns groups with single variants", () => {
        const products: Product[] = [
            { id: "1", name: "Água sem Gás", sellPrice: 300, isActive: true },
            { id: "2", name: "Chocolate", sellPrice: 500, isActive: true },
        ]

        const groups = groupProducts(products)

        expect(groups).toHaveLength(2)
        expect(groups[0]).toEqual({
            id: "água sem gás",
            name: "Água sem Gás",
            variants: [{ label: "Água sem Gás", product: products[0] }],
        })
        expect(groups[1]).toEqual({
            id: "chocolate",
            name: "Chocolate",
            variants: [{ label: "Chocolate", product: products[1] }],
        })
    })

    it("GIVEN products sharing a base name with ' - ' delimiter WHEN groupProducts is called THEN combines into a single group with extracted labels", () => {
        const products: Product[] = [
            { id: "1", name: "Camisa CAAD - P", sellPrice: 4000, isActive: true },
            { id: "2", name: "Camisa CAAD - M", sellPrice: 4000, isActive: true },
            { id: "3", name: "Camisa CAAD - G", sellPrice: 4500, isActive: true },
        ]

        const groups = groupProducts(products)

        expect(groups).toHaveLength(1)
        expect(groups[0].id).toBe("camisa caad")
        expect(groups[0].name).toBe("Camisa CAAD")
        expect(groups[0].variants).toHaveLength(3)
        expect(groups[0].variants[0]).toEqual({ label: "P", product: products[0] })
        expect(groups[0].variants[1]).toEqual({ label: "M", product: products[1] })
        expect(groups[0].variants[2]).toEqual({ label: "G", product: products[2] })
    })

    it("GIVEN products with multiple hyphens WHEN groupProducts is called THEN splits by the last ' - ' occurrence", () => {
        const products: Product[] = [
            { id: "1", name: "Suco - Laranja - 500ml", sellPrice: 800, isActive: true },
            { id: "2", name: "Suco - Laranja - 1L", sellPrice: 1400, isActive: true },
        ]

        const groups = groupProducts(products)

        expect(groups).toHaveLength(1)
        expect(groups[0].id).toBe("suco - laranja")
        expect(groups[0].name).toBe("Suco - Laranja")
        expect(groups[0].variants).toHaveLength(2)
        expect(groups[0].variants[0].label).toBe("500ml")
        expect(groups[0].variants[1].label).toBe("1L")
    })

    it("GIVEN empty array WHEN groupProducts is called THEN returns empty array", () => {
        expect(groupProducts([])).toEqual([])
    })
})
