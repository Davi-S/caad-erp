/**
 * Reporting Analytics and Excel Interop tRPC router exposing analytical reporting queries
 * and workbook export/import procedures used by the UI.
 */

import { z } from "zod"
import { calculateInventory } from "../../bll/index.js"
import { exportWorkbook } from "../../excel/exporter.js"
import { importWorkbook } from "../../excel/importer.js"
import { publicProcedure, router } from "../trpc.js"

export const reportsRouter = router({
    /**
     * Returns current on-hand inventory stock count per product ID.
     */
    inventory: publicProcedure.query(({ ctx }) => {
        return calculateInventory(ctx.db)
    }),

    /**
     * Exports all database tables into a Base64-encoded .xlsx Excel workbook.
     */
    exportWorkbook: publicProcedure.query(async ({ ctx }) => {
        const buffer = await exportWorkbook(ctx.db)
        return {
            base64: buffer.toString("base64"),
            filename: "master_workbook.xlsx",
        }
    }),

    /**
     * Accepts a Base64-encoded .xlsx file, replaces the current database contents,
     * and returns the import summary count.
     */
    importWorkbook: publicProcedure
        .input(
            z.object({
                base64: z.string().min(1, "Base64 content is required"),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            // Strip data URL prefix if present (e.g. data:application/vnd.openxmlformats-officedocument...;base64,)
            const rawBase64 = input.base64.includes(",") ? input.base64.split(",")[1] : input.base64
            const buffer = Buffer.from(rawBase64, "base64")
            const count = await importWorkbook(ctx.db, buffer)
            return {
                success: true,
                count,
            }
        }),
})
