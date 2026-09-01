/**
 * Unit test suite for Frontend Helper Utilities and Search Matchers.
 */

import { describe, expect, it } from "vitest"
import {
    slugify,
    brl,
    buildQrGrid,
    QR_SIZE,
    normalizeText,
    matchesSearch,
} from "../src/helpers/index"

describe("slugify", () => {
    it("GIVEN empty or falsy inputs WHEN slugify is called THEN returns empty string", () => {
        expect(slugify("")).toBe("")
        expect(slugify(null as unknown as string)).toBe("")
        expect(slugify(undefined as unknown as string)).toBe("")
    })

    it("GIVEN accented and uppercase characters WHEN slugify is called THEN strips accents and converts to lowercase", () => {
        expect(slugify("Água com Gás")).toBe("agua-com-gas")
        expect(slugify("Açúcar Refinado & Café")).toBe("acucar-refinado-cafe")
        expect(slugify("PRODUTO EM PROMOÇÃO")).toBe("produto-em-promocao")
    })

    it("GIVEN special characters, symbols, and irregular spaces WHEN slugify is called THEN formats clean hyphens", () => {
        expect(slugify("  --Café Expresso!--  ")).toBe("cafe-expresso")
        expect(slugify("Coca   Cola @@@ 350ml")).toBe("coca-cola-350ml")
        expect(slugify("Item #42 - Versão 2.0")).toBe("item-42-versao-2-0")
    })
})

describe("brl", () => {
    it("GIVEN cent amounts WHEN brl is called THEN returns formatted Brazilian Real currency string", () => {
        expect(brl(0)).toBe("R$ 0,00")
        expect(brl(5)).toBe("R$ 0,05")
        expect(brl(50)).toBe("R$ 0,50")
        expect(brl(500)).toBe("R$ 5,00")
        expect(brl(1250)).toBe("R$ 12,50")
        expect(brl(123456)).toBe("R$ 1234,56")
    })
})

describe("buildQrGrid", () => {
    it("GIVEN buildQrGrid WHEN called THEN returns QR_SIZE x QR_SIZE boolean matrix", () => {
        const grid = buildQrGrid()

        expect(grid).toHaveLength(QR_SIZE)
        for (const row of grid) {
            expect(row).toHaveLength(QR_SIZE)
            row.forEach((cell) => expect(typeof cell).toBe("boolean"))
        }
    })

    it("GIVEN buildQrGrid WHEN called THEN possesses valid finder block patterns at corners", () => {
        const grid = buildQrGrid()

        // Top-left 3x3 finder pattern check
        expect(grid[0][0]).toBe(true)
        expect(grid[0][1]).toBe(true)
        expect(grid[0][2]).toBe(true)
        expect(grid[1][0]).toBe(true)
        expect(grid[1][1]).toBe(true)
        expect(grid[1][2]).toBe(true)
        expect(grid[2][0]).toBe(true)
        expect(grid[2][1]).toBe(true)
        expect(grid[2][2]).toBe(true)

        // Top-right finder pattern
        expect(grid[0][QR_SIZE - 3]).toBe(true)
        expect(grid[0][QR_SIZE - 1]).toBe(true)

        // Bottom-left finder pattern
        expect(grid[QR_SIZE - 3][0]).toBe(true)
        expect(grid[QR_SIZE - 1][0]).toBe(true)
    })

    it("GIVEN multiple invocations WHEN buildQrGrid is called THEN returns deterministic output", () => {
        const gridA = buildQrGrid()
        const gridB = buildQrGrid()

        expect(gridA).toEqual(gridB)
    })
})

describe("normalizeText", () => {
    it("GIVEN accented and uppercase text WHEN normalizeText is called THEN strips diacritics and converts to lowercase", () => {
        expect(normalizeText("")).toBe("")
        expect(normalizeText(null as unknown as string)).toBe("")
        expect(normalizeText("Água Mineral")).toBe("agua mineral")
        expect(normalizeText("AÇÚCAR & CAFÉ")).toBe("acucar & cafe")
        expect(normalizeText("São Paulo")).toBe("sao paulo")
    })
})

describe("matchesSearch", () => {
    it("GIVEN empty or whitespace search query WHEN matchesSearch is called THEN returns true", () => {
        expect(matchesSearch("Refrigerante", "")).toBe(true)
        expect(matchesSearch("Refrigerante", "   ")).toBe(true)
    })

    it("GIVEN single term search WHEN matchesSearch is called THEN correctly matches with accent/case insensitivity", () => {
        expect(matchesSearch("Água Mineral sem Gás", "agua")).toBe(true)
        expect(matchesSearch("Água Mineral sem Gás", "AGUA")).toBe(true)
        expect(matchesSearch("Água Mineral sem Gás", "mineral")).toBe(true)
        expect(matchesSearch("Água Mineral sem Gás", "cerveja")).toBe(false)
    })

    it("GIVEN multi-word search query WHEN matchesSearch is called THEN verifies every token regardless of order", () => {
        expect(matchesSearch("Camiseta Algodão Preta G", "camis pret")).toBe(true)
        expect(matchesSearch("Camiseta Algodão Preta G", "g pret camis")).toBe(true)
        expect(matchesSearch("Camiseta Algodão Preta G", "camis azul")).toBe(false)
    })

    it("GIVEN array of string targets WHEN matchesSearch is called THEN joins and matches across all elements", () => {
        const targetArray = ["Água Mineral", "350ml", "Lata", null, undefined]

        expect(matchesSearch(targetArray, "agua lata")).toBe(true)
        expect(matchesSearch(targetArray, "350ml agua")).toBe(true)
        expect(matchesSearch(targetArray, "garrafa")).toBe(false)
    })

    it("GIVEN search query with only spaces or empty characters WHEN matchesSearch is called THEN returns true", () => {
        expect(matchesSearch("Refrigerante", "     ")).toBe(true)
    })
})
