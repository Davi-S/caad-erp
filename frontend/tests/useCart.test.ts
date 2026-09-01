/**
 * Unit test suite for the useCart React hook and state invariants.
 */

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCart } from "../src/features/pos/hooks/useCart"
import * as useProductsModule from "../src/hooks/queries/useProducts"
import * as useStockModule from "../src/hooks/queries/useStock"
import type { Product, Stock } from "../src/types"

vi.mock("../src/hooks/queries/useProducts")
vi.mock("../src/hooks/queries/useStock")

describe("useCart Hook", () => {
    const mockProducts: Product[] = [
        { id: "P1", name: "Refrigerante", sellPrice: 500, isActive: true },
        { id: "P2", name: "Salgado", sellPrice: 800, isActive: true },
        { id: "P3", name: "Bolo", sellPrice: 1200, isActive: true },
    ]

    const mockStock: Stock = {
        P1: 5,
        P2: 2,
    }

    beforeEach(() => {
        vi.restoreAllMocks()
        vi.mocked(useProductsModule.useProducts).mockReturnValue({
            data: mockProducts,
        } as ReturnType<typeof useProductsModule.useProducts>)
        vi.mocked(useStockModule.useStock).mockReturnValue({
            data: mockStock,
        } as ReturnType<typeof useStockModule.useStock>)
    })

    it("GIVEN fresh hook mount WHEN initialized THEN cart starts empty with zero amounts", () => {
        const { result } = renderHook(() => useCart())

        expect(result.current.items).toEqual({})
        expect(result.current.itemsList).toEqual([])
        expect(result.current.isEmpty).toBe(true)
        expect(result.current.subtotal).toBe(0)
        expect(result.current.totalItemDiscount).toBe(0)
        expect(result.current.netSubtotal).toBe(0)
        expect(result.current.discount).toBe(0)
        expect(result.current.total).toBe(0)
        expect(result.current.notes).toBe("")
    })

    it("GIVEN valid product WHEN inc is called THEN adds item to cart and calculates subtotal", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
        })

        expect(result.current.isEmpty).toBe(false)
        expect(result.current.itemsList).toHaveLength(1)
        expect(result.current.items.P1).toEqual({
            productId: "P1",
            name: "Refrigerante",
            unitPrice: 500,
            quantity: 1,
            discount: 0,
        })
        expect(result.current.subtotal).toBe(500)
        expect(result.current.total).toBe(500)
    })

    it("GIVEN non-existent product ID WHEN inc is called THEN does nothing", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("UNKNOWN_PRODUCT")
        })

        expect(result.current.isEmpty).toBe(true)
        expect(result.current.itemsList).toHaveLength(0)
    })

    it("GIVEN item at available stock limit WHEN inc is called THEN prevents adding more than stock", () => {
        const { result } = renderHook(() => useCart())

        // Stock for P2 is 2
        act(() => {
            result.current.inc("P2")
            result.current.inc("P2")
        })
        expect(result.current.items.P2.quantity).toBe(2)

        // Exceeds stock of 2
        act(() => {
            result.current.inc("P2")
        })
        expect(result.current.items.P2.quantity).toBe(2)
    })

    it("GIVEN product without explicit stock entry WHEN inc is called THEN allows incrementing without stock bound", () => {
        const { result } = renderHook(() => useCart())

        // P3 has no entry in mockStock
        act(() => {
            result.current.inc("P3")
            result.current.inc("P3")
            result.current.inc("P3")
        })
        expect(result.current.items.P3.quantity).toBe(3)
    })

    it("GIVEN items with quantity > 1 WHEN dec is called THEN decrements quantity and resets discounts", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
            result.current.inc("P1")
            result.current.setItemDiscount("P1", 200)
        })
        act(() => {
            result.current.setDiscount(100)
        })

        expect(result.current.items.P1.quantity).toBe(2)
        expect(result.current.items.P1.discount).toBe(200)
        expect(result.current.discount).toBe(100)

        act(() => {
            result.current.dec("P1")
        })

        expect(result.current.items.P1.quantity).toBe(1)
        expect(result.current.items.P1.discount).toBe(0) // Discount reset
        expect(result.current.discount).toBe(0) // Global discount reset
    })

    it("GIVEN item with quantity === 1 WHEN dec is called THEN removes item from cart", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
        })
        expect(result.current.items.P1).toBeDefined()

        act(() => {
            result.current.dec("P1")
        })
        expect(result.current.items.P1).toBeUndefined()
        expect(result.current.isEmpty).toBe(true)
    })

    it("GIVEN non-existent product ID WHEN dec is called THEN does not mutate state", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.dec("NON_EXISTENT")
        })
        expect(result.current.isEmpty).toBe(true)
    })

    it("GIVEN existing items in cart WHEN removeItem is called THEN removes targeted item and clears global discount", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
            result.current.inc("P2")
            result.current.setDiscount(200)
        })

        act(() => {
            result.current.removeItem("P1")
        })

        expect(result.current.items.P1).toBeUndefined()
        expect(result.current.items.P2).toBeDefined()
        expect(result.current.discount).toBe(0)

        // Removing non-existent does nothing
        act(() => {
            result.current.removeItem("NON_EXISTENT")
        })
        expect(result.current.items.P2).toBeDefined()
    })

    it("GIVEN item discount input WHEN setItemDiscount is called THEN clamps value and clears global discount", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
            result.current.inc("P1") // Gross = 2 * 500 = 1000
            result.current.setDiscount(100)
        })

        // Valid discount within range
        act(() => {
            result.current.setItemDiscount("P1", 400)
        })
        expect(result.current.items.P1.discount).toBe(400)
        expect(result.current.totalItemDiscount).toBe(400)
        expect(result.current.netSubtotal).toBe(600)
        expect(result.current.discount).toBe(0)

        // Clamping negative discount to 0
        act(() => {
            result.current.setItemDiscount("P1", -50)
        })
        expect(result.current.items.P1.discount).toBe(0)

        // Clamping discount exceeding item gross to 1000
        act(() => {
            result.current.setItemDiscount("P1", 1500)
        })
        expect(result.current.items.P1.discount).toBe(1000)

        // Non-existent item
        act(() => {
            result.current.setItemDiscount("UNKNOWN", 100)
        })
        expect(result.current.items.P1.discount).toBe(1000)
    })

    it("GIVEN item discount WHEN clearItemDiscount is called THEN resets item and global discounts", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
            result.current.setItemDiscount("P1", 300)
        })
        expect(result.current.items.P1.discount).toBe(300)

        act(() => {
            result.current.clearItemDiscount("P1")
        })
        expect(result.current.items.P1.discount).toBe(0)

        // Non-existent item
        act(() => {
            result.current.clearItemDiscount("UNKNOWN")
        })
    })

    it("GIVEN global discount input WHEN setDiscount and clearDiscount are called THEN clamps to netSubtotal and resets", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1") // 500
            result.current.inc("P2") // 800 -> Subtotal = 1300
        })

        act(() => {
            result.current.setDiscount(500)
        })
        expect(result.current.discount).toBe(500)
        expect(result.current.total).toBe(800)

        // Exceeding net subtotal clamps to 1300
        act(() => {
            result.current.setDiscount(2000)
        })
        expect(result.current.discount).toBe(1300)
        expect(result.current.total).toBe(0)

        // Negative discount clamps to 0
        act(() => {
            result.current.setDiscount(-200)
        })
        expect(result.current.discount).toBe(0)

        act(() => {
            result.current.setDiscount(400)
            result.current.clearDiscount()
        })
        expect(result.current.discount).toBe(0)
    })

    it("GIVEN multiple discounts across cart WHEN clearAllDiscounts is called THEN resets all item and global discounts", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
            result.current.inc("P2")
            result.current.setItemDiscount("P1", 100)
            result.current.setItemDiscount("P2", 200)
        })
        act(() => {
            result.current.setDiscount(300)
        })

        expect(result.current.totalItemDiscount).toBe(300)

        act(() => {
            result.current.clearAllDiscounts()
        })

        expect(result.current.items.P1.discount).toBe(0)
        expect(result.current.items.P2.discount).toBe(0)
        expect(result.current.discount).toBe(0)
        expect(result.current.totalItemDiscount).toBe(0)
    })

    it("GIVEN populated cart WHEN clearCart is called THEN empties all items and discounts", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.inc("P1")
            result.current.setDiscount(200)
            result.current.setNotes("Obs")
        })

        act(() => {
            result.current.clearCart()
        })

        expect(result.current.isEmpty).toBe(true)
        expect(result.current.items).toEqual({})
        expect(result.current.discount).toBe(0)
        expect(result.current.notes).toBe("Obs")
    })

    it("GIVEN notes state WHEN setNotes and clearNotes are called THEN updates and resets string", () => {
        const { result } = renderHook(() => useCart())

        act(() => {
            result.current.setNotes("Pedido mesa 3")
        })
        expect(result.current.notes).toBe("Pedido mesa 3")

        act(() => {
            result.current.clearNotes()
        })
        expect(result.current.notes).toBe("")
    })
})
