/**
 * Unit test suite for splitting money without losing or inventing cents.
 */

import { describe, expect, it } from "vitest"
import { distribute } from "../../../src/bll/ledger/money.js"

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

describe("distribute", () => {
    it("GIVEN a total that divides evenly THEN every part is the same", () => {
        expect(distribute([1000, 1000], 200)).toEqual([100, 100])
    })

    it("GIVEN a total that does not divide evenly THEN the odd cent lands on one part and the sum is exact", () => {
        const parts = distribute([1000, 1000, 1000], 100)

        expect(parts).toEqual([33, 34, 33])
        expect(sum(parts)).toBe(100)
    })

    it("GIVEN weights of different sizes THEN each part is proportional to its weight", () => {
        const parts = distribute([500, 1500, 3000], 650)

        expect(parts).toEqual([65, 195, 390])
        expect(sum(parts)).toBe(650)
    })

    it("GIVEN nothing to split THEN every part is zero", () => {
        expect(distribute([1000, 2000], 0)).toEqual([0, 0])
    })

    it("GIVEN a single weight THEN it takes the whole total", () => {
        expect(distribute([1000], 250)).toEqual([250])
    })

    it("GIVEN weights that are all zero THEN the first part takes it all, since there is nothing to be proportional to", () => {
        expect(distribute([0, 0, 0], 90)).toEqual([90, 0, 0])
    })

    it("GIVEN a line worth less than nothing THEN it still splits, and leaves the caller's rules to refuse the result", () => {
        const parts = distribute([-100, 1000], 100)

        expect(sum(parts)).toBe(100)
    })

    it("GIVEN awkward totals over many weights THEN the parts always add up to the total exactly", () => {
        for (let total = 1; total <= 100; total++) {
            expect(sum(distribute([333, 777, 1234, 9, 5000], total))).toBe(total)
        }
    })
})
