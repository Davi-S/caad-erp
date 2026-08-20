import { describe, expect, it } from "vitest"
import { z } from "zod"
import { InvalidAttributeError } from "../../src/bll/errors.js"
import { validateSchema } from "../../src/bll/validator.js"

describe("BLL Validator", () => {
    it("throws InvalidAttributeError when schema validation fails without custom params.errorClass", () => {
        const schema = z.object({
            name: z.string(),
        })

        expect(() => validateSchema(schema, { name: 123 })).toThrow(InvalidAttributeError)
    })
})

