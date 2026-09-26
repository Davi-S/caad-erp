/**
 * Unit test suite for the salesman commands, and for the one case the ledger
 * cannot attribute to anybody else: the very first salesman.
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
    createSalesman,
    getSalesman,
    getSalesmanHistory,
    InactiveError,
    InvalidInputError,
    listSalesmen,
    NotFoundError,
    requireActiveSalesman,
    updateSalesman,
} from "../../src/bll/index.js"
import { freshDb } from "../fixtures.js"
import type { DB } from "../../src/dal/index.js"

let db: DB

beforeEach(() => {
    db = freshDb()
})

describe("createSalesman", () => {
    it("GIVEN an empty ledger and nobody to name THEN the first salesman is recorded as their own author", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })

        expect(getSalesman(db, boss.id)).toEqual(boss)
        expect(getSalesmanHistory(db, boss.id).map((row) => row.changedBy)).toEqual([boss.id])
    })

    it("GIVEN an empty ledger and an author anyway THEN it is refused, because that author cannot exist", () => {
        expect(() =>
            createSalesman(db, { name: "Boss", isActive: true, changedBy: "somebody" }),
        ).toThrow(InvalidInputError)
        expect(listSalesmen(db)).toHaveLength(0)
    })

    it("GIVEN salesmen already exist and no author THEN it is refused: only the first one has nobody to name", () => {
        createSalesman(db, { name: "Boss", isActive: true })

        expect(() => createSalesman(db, { name: "Helper", isActive: true })).toThrow(
            /The salesman making the change is required/,
        )
        expect(listSalesmen(db)).toHaveLength(1)
    })

    it("GIVEN an author who does not exist THEN nothing is created", () => {
        createSalesman(db, { name: "Boss", isActive: true })

        expect(() =>
            createSalesman(db, { name: "Helper", isActive: true, changedBy: "nobody" }),
        ).toThrow(NotFoundError)
        expect(listSalesmen(db)).toHaveLength(1)
    })

    it("GIVEN an author who has left THEN nothing is created", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })
        const gone = createSalesman(db, { name: "Gone", isActive: false, changedBy: boss.id })

        expect(() =>
            createSalesman(db, { name: "Helper", isActive: true, changedBy: gone.id }),
        ).toThrow(InactiveError)
        expect(listSalesmen(db)).toHaveLength(2)
    })

    it("GIVEN a salesman who has already left the lounge THEN they can still be recorded, so their past work has an owner", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })

        const gone = createSalesman(db, { name: "Gone", isActive: false, changedBy: boss.id })

        expect(gone.isActive).toBe(false)
    })
})

describe("updateSalesman", () => {
    it("GIVEN a salesman leaving THEN they are deactivated rather than deleted, and the change is attributed", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })
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

    it("GIVEN a salesman closing the lounge on their own THEN they may deactivate themselves, since they are still active as they do it", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })

        expect(updateSalesman(db, boss.id, { isActive: false, changedBy: boss.id }).isActive).toBe(
            false,
        )
        // And from then on they can change nothing, including themselves
        expect(() => updateSalesman(db, boss.id, { isActive: true, changedBy: boss.id })).toThrow(
            InactiveError,
        )
    })

    it("GIVEN only an author and nothing to change THEN it is refused", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })

        expect(() => updateSalesman(db, boss.id, { changedBy: boss.id })).toThrow(
            /No fields to update/,
        )
    })

    it("GIVEN a salesman who does not exist THEN it is reported as missing", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })

        expect(() => updateSalesman(db, "nope", { name: "Ghost", changedBy: boss.id })).toThrow(
            NotFoundError,
        )
    })
})

describe("requireActiveSalesman", () => {
    it("GIVEN a salesman who has left THEN they cannot act", () => {
        const boss = createSalesman(db, { name: "Boss", isActive: true })
        const gone = createSalesman(db, { name: "Gone", isActive: false, changedBy: boss.id })

        expect(() => requireActiveSalesman(db, gone.id)).toThrow(InactiveError)
        expect(() => requireActiveSalesman(db, "nobody")).toThrow(NotFoundError)
    })
})
