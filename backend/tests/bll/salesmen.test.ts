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
    listSalesmen,
    InvalidInputError,
    NotFoundError,
    requireActiveSalesman,
    RuleViolationError,
    updateSalesman,
} from "../../src/bll/index.js"
import { freshDb } from "../fixtures.js"
import { names, without } from "./fixtures.js"
import type { DB } from "../../src/dal/index.js"

let db: DB

beforeEach(() => {
    db = freshDb()
})

describe("createFirstSalesman", () => {
    it("GIVEN no name THEN it is refused, naming it", () => {
        expect(() => createFirstSalesman(db, {} as never)).toThrow(InvalidInputError)
        expect(() => createFirstSalesman(db, {} as never)).toThrow(/name/)
        expect(listSalesmen(db)).toHaveLength(0)
    })

    it("GIVEN an empty ledger THEN the salesman is recorded as their own author, and is active", () => {
        const boss = createFirstSalesman(db, { name: "  Boss  " })

        expect(boss).toMatchObject({ name: "Boss", isActive: true })
        expect(getSalesman(db, boss.id)).toEqual(boss)
        expect(getSalesmanHistory(db, boss.id).map((row) => row.changedBy)).toEqual([boss.id])
    })

    it("GIVEN a ledger that already has a salesman THEN it is refused, so nobody can be created unattributed later", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })

        expect(() => createFirstSalesman(db, { name: "Sneaky" })).toThrow(RuleViolationError)
        expect(() => createFirstSalesman(db, { name: "Sneaky" })).toThrow(
            /already has a salesman; a new one is added by one of them/,
        )
        expect(listSalesmen(db)).toEqual([boss])
    })

    it("GIVEN anything beyond a name THEN it is refused: there is nobody to attribute them to, and they cannot start inactive", () => {
        expect(() => createFirstSalesman(db, { name: "Boss", isActive: false } as never)).toThrow(
            /Unrecognized key: "isActive"/,
        )
        expect(() =>
            createFirstSalesman(db, { name: "Boss", changedBy: "somebody" } as never),
        ).toThrow(/Unrecognized key: "changedBy"/)
    })
})

describe("createSalesman", () => {
    it("GIVEN no author THEN it is refused by the contract itself, not by a rule deeper in", () => {
        createFirstSalesman(db, { name: "Boss" })

        expect(() => createSalesman(db, { name: "Helper", isActive: true } as never)).toThrow(
            /changedBy: The salesman making the change is required/,
        )
        expect(listSalesmen(db)).toHaveLength(1)
    })

    it("GIVEN an empty ledger and an author anyway THEN it is refused, because that author cannot exist", () => {
        expect(() =>
            createSalesman(db, { name: "Boss", isActive: true, changedBy: "somebody" }),
        ).toThrow(NotFoundError)
        expect(listSalesmen(db)).toHaveLength(0)
    })

    it("GIVEN any missing field THEN it is refused, naming it", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })
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

    it("GIVEN an author who does not exist THEN nothing is created", () => {
        createFirstSalesman(db, { name: "Boss" })

        expect(() =>
            createSalesman(db, { name: "Helper", isActive: true, changedBy: "nobody" }),
        ).toThrow(NotFoundError)
        expect(listSalesmen(db)).toHaveLength(1)
    })

    it("GIVEN an author who is inactive THEN nothing is created", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })
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

    it("GIVEN a salesman who is already inactive THEN they can still be recorded, so their past work has an owner", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })

        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(inactive.isActive).toBe(false)
    })
})

describe("updateSalesman", () => {
    it("GIVEN a salesman who should no longer act THEN they are deactivated rather than deleted, and the change is attributed", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })
        const helper = createSalesman(db, { name: "Helper", isActive: true, changedBy: boss.id })

        const updated = updateSalesman(db, helper.id, { isActive: false, changedBy: boss.id })

        expect(updated.isActive).toBe(false)
        expect(
            getSalesmanHistory(db, helper.id).map((row) => [row.isActive, row.changedBy]),
        ).toEqual([
            [true, boss.id],
            [false, boss.id],
        ])
    })

    it("GIVEN a salesman deactivating themselves THEN it is allowed, since they are still active as they do it", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })

        expect(updateSalesman(db, boss.id, { isActive: false, changedBy: boss.id }).isActive).toBe(
            false,
        )
        // And from then on they can change nothing, including themselves
        expect(() => updateSalesman(db, boss.id, { isActive: true, changedBy: boss.id })).toThrow(
            InactiveError,
        )
    })

    it("GIVEN only an author and nothing to change THEN it is refused", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })

        expect(() => updateSalesman(db, boss.id, { changedBy: boss.id })).toThrow(
            /No fields to update/,
        )
    })

    it("GIVEN a salesman who does not exist THEN it is reported as missing", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })

        expect(() => updateSalesman(db, "nope", { name: "Ghost", changedBy: boss.id })).toThrow(
            NotFoundError,
        )
    })
})

describe("requireActiveSalesman", () => {
    it("GIVEN a salesman who is inactive THEN they cannot act", () => {
        const boss = createFirstSalesman(db, { name: "Boss" })
        const inactive = createSalesman(db, {
            name: "Inactive",
            isActive: false,
            changedBy: boss.id,
        })

        expect(() => requireActiveSalesman(db, inactive.id)).toThrow(InactiveError)
        expect(() => requireActiveSalesman(db, "nobody")).toThrow(NotFoundError)
    })
})
