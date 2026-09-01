/**
 * Unit test suite for useTanStackListControls hook and accentGlobalFilterFn.
 */

import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ColumnDef } from "@tanstack/react-table"
import {
    accentGlobalFilterFn,
    useTanStackListControls,
    type SortOption,
} from "../../src/hooks/useTanStackListControls"

interface TestItem {
    id: string
    name: string
    category: string
    price: number
}

describe("useTanStackListControls and FilterFn", () => {
    describe("accentGlobalFilterFn", () => {
        it("GIVEN row when target column matches search THEN returns true", () => {
            const mockRow = {
                getValue: (colId: string) => (colId === "name" ? "Água Mineral" : undefined),
                getAllCells: () => [],
            } as any

            expect(accentGlobalFilterFn(mockRow, "name", "agua", () => {})).toBe(true)
        })

        it("GIVEN row when target column does not match but other cell does THEN searches all cells and returns true", () => {
            const mockRow = {
                getValue: () => "Bebidas",
                getAllCells: () => [
                    { getValue: () => "Bebidas" },
                    { getValue: () => "Água Mineral com Gás" },
                    { getValue: () => null },
                    { getValue: () => undefined },
                ],
            } as any

            expect(accentGlobalFilterFn(mockRow, "category", "gas agua", () => {})).toBe(true)
        })

        it("GIVEN row when no cells match search query THEN returns false", () => {
            const mockRow = {
                getValue: () => "Salgado",
                getAllCells: () => [{ getValue: () => "Salgado" }, { getValue: () => "Coxinha" }],
            } as any

            expect(accentGlobalFilterFn(mockRow, "category", "refrigerante", () => {})).toBe(false)
        })
    })

    describe("useTanStackListControls Hook", () => {
        const sampleData: TestItem[] = [
            { id: "1", name: "Água Mineral", category: "Bebidas", price: 300 },
            { id: "2", name: "Refrigerante Cola", category: "Bebidas", price: 500 },
            { id: "3", name: "Salgado Assado", category: "Comidas", price: 800 },
            { id: "4", name: "Bolo de Chocolate", category: "Doces", price: 1200 },
        ]

        const columns: ColumnDef<TestItem, any>[] = [
            { accessorKey: "name", header: "Nome" },
            { accessorKey: "category", header: "Categoria" },
            { accessorKey: "price", header: "Preço" },
        ]

        const sortOptions: SortOption<"name-asc" | "price-desc">[] = [
            {
                value: "name-asc",
                label: "Nome (A-Z)",
                sorting: [{ id: "name", desc: false }],
            },
            {
                value: "price-desc",
                label: "Preço (Maior)",
                sorting: [{ id: "price", desc: true }],
            },
        ]

        it("GIVEN initial render WHEN options provided THEN initializes default sort and full data list", () => {
            const { result } = renderHook(() =>
                useTanStackListControls({
                    data: sampleData,
                    columns,
                    sortOptions,
                    initialSortKey: "name-asc",
                }),
            )

            expect(result.current.selectedSortKey).toBe("name-asc")
            expect(result.current.searchQuery).toBe("")
            expect(result.current.processedItems).toHaveLength(4)
            expect(result.current.controlsProps.sortOptions).toEqual([
                { value: "name-asc", label: "Nome (A-Z)" },
                { value: "price-desc", label: "Preço (Maior)" },
            ])
        })

        it("GIVEN search query input WHEN setSearchQuery is called THEN filters processedItems with accent insensitivity", () => {
            const { result } = renderHook(() =>
                useTanStackListControls({
                    data: sampleData,
                    columns,
                    sortOptions,
                }),
            )

            act(() => {
                result.current.setSearchQuery("agua")
            })

            expect(result.current.searchQuery).toBe("agua")
            expect(result.current.processedItems).toHaveLength(1)
            expect(result.current.processedItems[0].name).toBe("Água Mineral")

            act(() => {
                result.current.controlsProps.onSearchChange("bebidas")
            })
            expect(result.current.processedItems).toHaveLength(2)
        })

        it("GIVEN sorting key change WHEN onSortChange is called THEN re-sorts processedItems", () => {
            const { result } = renderHook(() =>
                useTanStackListControls({
                    data: sampleData,
                    columns,
                    sortOptions,
                    initialSortKey: "name-asc",
                }),
            )

            act(() => {
                result.current.controlsProps.onSortChange("price-desc")
            })

            expect(result.current.selectedSortKey).toBe("price-desc")
            expect(result.current.processedItems[0].price).toBe(1200)
            expect(result.current.processedItems[3].price).toBe(300)
        })

        it("GIVEN null or undefined data WHEN hook renders THEN falls back to empty processedItems array", () => {
            const { result } = renderHook(() =>
                useTanStackListControls<TestItem>({
                    data: undefined,
                    columns,
                }),
            )

            expect(result.current.processedItems).toEqual([])
        })
    })
})
