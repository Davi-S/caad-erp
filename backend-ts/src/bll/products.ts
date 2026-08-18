/**
 * Product domain handlers coordinating validation, business rules, and persistence.
 *
 * Implements high-level product workflows (`listProducts`, `getProduct`, `addProduct`,
 * `updateProduct`) by colocating Zod command schemas, domain invariant rules, and
 * Data Access Layer (DAL) execution.
 */

import { z } from "zod"
import type { DB, ProductRow } from "../dal/index.js"
import * as dal from "../dal/index.js"
import {
    DuplicateProductError,
    InvalidAttributeError,
    InvalidMonetaryValueError,
    ProductNotFoundError,
} from "./errors.js"
import { validateSchema } from "./validator.js"

/**
 * Retrieves all product records from the catalog.
 *
 * @param db - Active database client instance.
 * @returns Array of all {@link ProductRow} items.
 */
export function listProducts(db: DB): ProductRow[] {
    return dal.listProducts(db)
}

/**
 * Retrieves a single product record by identifier.
 *
 * @param db - Active database client instance.
 * @param productId - Unique product identifier.
 * @returns The matching {@link ProductRow}.
 * @throws {@link ProductNotFoundError} If no product exists with the given ID.
 */
export function getProduct(db: DB, productId: string): ProductRow {
    const product = dal.getProduct(db, productId)
    if (!product) {
        throw new ProductNotFoundError(`Unknown product id: ${productId}`)
    }
    return product
}

/**
 * Zod validation schema and command payload for registering a new product.
 */
export const addProductSchema = z.object({
    productId: z
        .string()
        .trim()
        .min(1, {
            message: "Product ID must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    productName: z
        .string()
        .trim()
        .min(1, {
            message: "Product name must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>),
    sellPrice: z
        .number()
        .int({
            message: "Sell price must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>)
        .min(0, {
            message: "Sell price must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>),
    isActive: z.boolean(),
})

export type AddProductCommand = z.infer<typeof addProductSchema>

/**
 * Validates input payload and registers a new product in the catalog.
 *
 * @param db - Active database client instance.
 * @param command - Raw input object matching {@link AddProductCommand}.
 * @returns The newly created and persisted {@link ProductRow}.
 * @throws {@link InvalidAttributeError} If product ID or name are empty.
 * @throws {@link InvalidMonetaryValueError} If sell price is negative.
 * @throws {@link DuplicateProductError} If a product with the same ID already exists.
 */
export function addProduct(db: DB, command: AddProductCommand): ProductRow {
    // Validate input payload structure and boundary types using Zod
    const validated = validateSchema(addProductSchema, command)

    // Enforce domain rule checking for duplicate product identifier
    const existing = dal.getProduct(db, validated.productId)
    if (existing) {
        throw new DuplicateProductError(`Product already exists: ${validated.productId}`)
    }

    // Persist new product record in SQLite database
    return dal.appendProduct(db, validated)
}

/**
 * Zod validation schema and command payload for updating selected fields of a product.
 */
export const updateProductSchema = z.object({
    productName: z
        .string()
        .trim()
        .min(1, {
            message: "Product name must be provided",
            params: { errorClass: InvalidAttributeError },
        } as Record<string, unknown>)
        .optional(),
    sellPrice: z
        .number()
        .int({
            message: "Sell price must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>)
        .min(0, {
            message: "Sell price must be zero or positive",
            params: { errorClass: InvalidMonetaryValueError },
        } as Record<string, unknown>)
        .optional(),
    isActive: z.boolean().optional(),
})

export type UpdateProductCommand = z.infer<typeof updateProductSchema>

/**
 * Validates update payload and modifies an existing product in the catalog.
 *
 * @param db - Active database client instance.
 * @param productId - Unique identifier of the product to update.
 * @param command - Raw update object matching {@link UpdateProductCommand}.
 * @returns The updated and persisted {@link ProductRow}.
 * @throws {@link ProductNotFoundError} If the target product does not exist.
 * @throws {@link InvalidAttributeError} If empty string values are provided.
 * @throws {@link InvalidMonetaryValueError} If sell price is negative.
 */
export function updateProduct(
    db: DB,
    productId: string,
    command: UpdateProductCommand,
): ProductRow {
    // Validate input payload structure using Zod
    const validated = validateSchema(updateProductSchema, command)

    // Enforce domain rule ensuring target product exists in catalog
    getProduct(db, productId)

    // Execute SQL update in SQLite database
    return dal.updateProduct(db, productId, validated)
}
