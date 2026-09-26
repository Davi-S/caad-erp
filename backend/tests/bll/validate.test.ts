/**
 * Unit test suite for input validation: the contract with the caller.
 */

import { describe, expect, it } from "vitest"
import { InvalidInputError } from "../../src/bll/errors.js"
import { validate } from "../../src/bll/validate.js"
import { z } from "zod"

const schema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    quantity: z.int("Quantity must be a whole number").positive("Quantity must be positive"),
    notes: z.string().nullable().default(null),
})

describe("validate", () => {
    it("GIVEN input that matches THEN it comes back parsed, trimmed and with defaults applied", () => {
        expect(validate(schema, { name: "  Coke  ", quantity: 2 })).toEqual({
            name: "Coke",
            quantity: 2,
            notes: null,
        })
    })

    it("GIVEN one field that is wrong THEN the error names the field", () => {
        expect(() => validate(schema, { name: "Coke", quantity: 0 })).toThrow(InvalidInputError)
        expect(() => validate(schema, { name: "Coke", quantity: 0 })).toThrow(
            "quantity: Quantity must be positive",
        )
    })

    it("GIVEN several fields that are wrong THEN every one of them is reported", () => {
        expect(() => validate(schema, { name: "", quantity: 1.5 })).toThrow(
            /name: Name is required; quantity: Quantity must be a whole number/,
        )
    })

    it("GIVEN a field inside a list THEN the error names its position", () => {
        const items = z.object({ items: z.array(z.object({ quantity: z.int() })) })

        expect(() => validate(items, { items: [{ quantity: 1 }, { quantity: 1.5 }] })).toThrow(
            /items\.1\.quantity/,
        )
    })

    it("GIVEN a rule about the input as a whole THEN the message stands on its own, with no field to name", () => {
        const whole = z.object({ a: z.number().optional() }).refine(() => false, "Nothing to do")

        expect(() => validate(whole, {})).toThrow("Nothing to do")
    })
})
