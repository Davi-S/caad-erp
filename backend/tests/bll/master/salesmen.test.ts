/**
 * Unit test suite for the salesman commands, and for the one case the ledger
 * cannot attribute to anybody else: the very first salesman.
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    createFirstSalesman,
    createSalesman,
    getSalesman,
    getSalesmanHistory,
    InactiveError,
    InvalidInputError,
    listSalesmen,
    NotFoundError,
    requireActiveSalesman,
    RuleViolationError,
    updateSalesman,
} from "../../../src/bll/index.js"
import type { DB, SalesmanRow } from "../../../src/dal/index.js"
import { freshDb } from "../../fixtures.js"
import { names, without } from "../fixtures.js"

let db: DB

beforeEach(() => {
    db = freshDb()
})

describe("createFirstSalesman", () => {
    it("GIVEN an empty ledger THEN the salesman is stored as given, with their name trimmed, active, and their own author", () => {
        const boss = createFirstSalesman(db, { name: "  Boss  " })

        expect(boss).toMatchObject({ name: "Boss", isActive: true })
        expect(getSalesman(db, boss.id)).toEqual(boss)
        expect(getSalesmanHistory(db, boss.id).map((row) => row.changedBy)).toEqual([boss.id])
    })

    it("GIVEN any missing field THEN it is refused, naming it", () => {
        expect(() => createFirstSalesman(db, {} as never)).toThrow(InvalidInputError)
        expect(() => createFirstSalesman(db, {} as never)).toThrow(names("name"))
        expect(listSalesmen(db)).toHaveLength(0)
    })

    it("GIVEN a blank name THEN it is refused", () => {
        expect(() => createFirstSalesman(db, { name: "   " })).toThrow(/name: Name is required/)
    })

    it("GIVEN a ledger that already has a salesman THEN it is refused, so nobody can be created unattributed later", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })

        expect(() => createFirstSalesman(db, { name: "Sneaky" })).toThrow(RuleViolationError)
        expect(() => createFirstSalesman(db, { name: "Sneaky" })).toThrow(
            /already has a salesman; a new one is added by one of them/,
        )
        expect(listSalesmen(db)).toEqual([boss])
    })

    it("GIVEN an empty ledger THEN the ordinary command cannot be used instead, because no author can exist yet", () => {
        expect(() =>
            createSalesman(db, { name: "Boss", isActive: true, changedBy: "somebody" }),
        ).toThrow(NotFoundError)
        expect(listSalesmen(db)).toHaveLength(0)
    })

    it("GIVEN a field the command does not accept THEN it is refused rather than dropped", () => {
        expect(() => createFirstSalesman(db, { name: "Boss", isActive: false } as never)).toThrow(
            /Unrecognized key: "isActive"/,
        )
        expect(() =>
            createFirstSalesman(db, { name: "Boss", changedBy: "somebody" } as never),
        ).toThrow(/Unrecognized key: "changedBy"/)
    })
})

describe("createSalesman", () => {
    let boss: SalesmanRow

    beforeEach(() => {
        boss = createFirstSalesman(db, { name: "Boss" })
    })

    it("GIVEN every field THEN the salesman is stored as given, with their name trimmed", () => {
        const helper = createSalesman(db, {
            name: "  Helper  ",
            isActive: true,
            changedBy: boss.id,
        })

        expect(helper).toMatchObject({ name: "Helper", isActive: true })
        expect(getSalesman(db, helper.id)).toEqual(helper)
    })

    it("GIVEN any missing field THEN it is refused, naming it: creation has no defaults to fall back on", () => {
        const valid = { name: "Helper", isActive: true, changedBy: boss.id }

        for (const path of ["name", "isActive", "changedBy"]) {
            expect(() => createSalesman(db, without(valid, path) as never), path).toThrow(
                InvalidInputError,
            )
            expect(() => createSalesman(db, without(valid, path) as never), path).toThrow(
                names(path),
            )
        }

        expect(listSalesmen(db)).toHaveLength(1)
    })

    it("GIVEN a blank name THEN it is refused", () => {
        expect(() =>
            createSalesman(db, { name: "   ", isActive: true, changedBy: boss.id }),
        ).toThrow(/name: Name is required/)
    })

    it("GIVEN a salesman who is already inactive THEN they can still be recorded, so their past work has an owner", () => {
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(inactive.isActive).toBe(false)
    })

    it("GIVEN an author who does not exist THEN nothing is created, and the error says which record is missing", () => {
        expect(() =>
            createSalesman(db, { name: "Helper", isActive: true, changedBy: "nobody" }),
        ).toThrow(NotFoundError)
        expect(listSalesmen(db)).toHaveLength(1)
    })

    it("GIVEN an author who is inactive THEN nothing is created: a change has to be attributable to an active salesman", () => {
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() =>
            createSalesman(db, { name: "Helper", isActive: true, changedBy: inactive.id }),
        ).toThrow(InactiveError)
        expect(listSalesmen(db)).toHaveLength(2)
    })

    it("GIVEN a field the command does not accept THEN it is refused rather than dropped", () => {
        expect(() =>
            createSalesman(db, {
                name: "Helper",
                isActive: true,
                changedBy: boss.id,
                nickname: "Hel",
            } as never),
        ).toThrow(/Unrecognized key: "nickname"/)
    })
})

describe("updateSalesman", () => {
    let boss: SalesmanRow

    beforeEach(() => {
        boss = createFirstSalesman(db, { name: "Boss" })
    })

    it("GIVEN no author THEN it is refused: every change is attributed, even a partial one", () => {
        expect(() => updateSalesman(db, boss.id, { name: "Chief" } as never)).toThrow(
            /changedBy: The salesman making the change is required/,
        )
    })

    it("GIVEN one field THEN only that field changes", () => {
        const helper = createSalesman(db, { name: "Helper", isActive: true, changedBy: boss.id })

        const updated = updateSalesman(db, helper.id, { isActive: false, changedBy: boss.id })

        expect(updated).toEqual({ ...helper, isActive: false })
        expect(
            getSalesmanHistory(db, helper.id).map((row) => [row.isActive, row.changedBy]),
        ).toEqual([
            [true, boss.id],
            [false, boss.id],
        ])
    })

    it("GIVEN only an author and nothing to change THEN it is refused", () => {
        expect(() => updateSalesman(db, boss.id, { changedBy: boss.id })).toThrow(InvalidInputError)
        expect(() => updateSalesman(db, boss.id, { changedBy: boss.id })).toThrow(
            /No fields to update/,
        )
    })

    it("GIVEN a salesman who does not exist THEN it is reported as missing", () => {
        expect(() => updateSalesman(db, "nope", { name: "Ghost", changedBy: boss.id })).toThrow(
            NotFoundError,
        )
    })

    it("GIVEN an author who is inactive THEN the change is refused and the salesman is untouched", () => {
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() =>
            updateSalesman(db, boss.id, { name: "Chief", changedBy: inactive.id }),
        ).toThrow(InactiveError)
        expect(getSalesman(db, boss.id).name).toBe("Boss")
        expect(getSalesmanHistory(db, boss.id)).toHaveLength(1)
    })

    it("GIVEN a salesman deactivating themselves THEN it is allowed, since they are still active as they do it", () => {
        expect(updateSalesman(db, boss.id, { isActive: false, changedBy: boss.id }).isActive).toBe(
            false,
        )
        // And from then on they can change nothing, including themselves
        expect(() => updateSalesman(db, boss.id, { isActive: true, changedBy: boss.id })).toThrow(
            InactiveError,
        )
    })

    it("GIVEN a field the command does not accept THEN it is refused rather than dropped", () => {
        expect(() =>
            updateSalesman(db, boss.id, { nickname: "Chief", changedBy: boss.id } as never),
        ).toThrow(/Unrecognized key: "nickname"/)
    })
})

describe("getSalesman", () => {
    it("GIVEN a salesman who does not exist THEN it is reported as missing rather than returned empty", () => {
        expect(() => getSalesman(db, "nope")).toThrow(NotFoundError)
    })
})

describe("requireActiveSalesman", () => {
    let boss: SalesmanRow

    beforeEach(() => {
        boss = createFirstSalesman(db, { name: "Boss" })
    })

    it("GIVEN a salesman who is inactive THEN they are refused for anything that records something new", () => {
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() => requireActiveSalesman(db, inactive.id)).toThrow(InactiveError)
    })

    it("GIVEN a salesman who is active THEN they come back", () => {
        expect(requireActiveSalesman(db, boss.id)).toEqual(boss)
    })

    it("GIVEN a salesman who does not exist THEN it is reported as missing", () => {
        expect(() => requireActiveSalesman(db, "nobody")).toThrow(NotFoundError)
    })
})

describe("getSalesmanHistory", () => {
    let boss: SalesmanRow

    beforeEach(() => {
        boss = createFirstSalesman(db, { name: "Boss" })
    })

    it("GIVEN a salesman who changed THEN every state they were left in comes back, oldest first", () => {
        const helper = createSalesman(db, { name: "Helper", isActive: true, changedBy: boss.id })
        updateSalesman(db, helper.id, { name: "Helper II", changedBy: boss.id })

        expect(getSalesmanHistory(db, helper.id).map((row) => row.name)).toEqual([
            "Helper",
            "Helper II",
        ])
    })

    it("GIVEN a salesman who does not exist THEN it is reported as missing rather than returned empty", () => {
        expect(() => getSalesmanHistory(db, "nope")).toThrow(NotFoundError)
    })
})
