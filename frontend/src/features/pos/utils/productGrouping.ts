import type { Product } from "@/types"

export interface ProductVariant {
    // Extracted variant label (e.g., "P", "M", "350ml") or full name if standalone
    label: string
    // Raw Product object containing id, sellPrice, isActive, etc.
    product: Product
}

export interface ProductGroup {
    // Case-insensitive normalized base name used for React keys and dictionary Map matching
    id: string
    // Human-readable display base name shown on top of the card header
    name: string
    // Array of variant items under this group (at least 1 variant)
    variants: ProductVariant[]
}

/**
 * Groups products by base name using the `\s+-\s+` delimiter rule.
 * Every product is returned wrapped inside a ProductGroup.
 * Groups with 1 variant represent standalone products.
 * Groups with 2+ variants represent product variation families.
 *
 * @param products Array of raw Product objects from the API or search/sort filters
 * @returns Array of unified ProductGroup objects
 */
export function groupProducts(products: Product[]): ProductGroup[] {
    const groupMap = new Map<string, ProductGroup>()

    for (const product of products) {
        const name = product.name ? product.name.trim() : ""
        // Match last occurrence of hyphen surrounded by spaces
        const lastHyphenIndex = name.lastIndexOf(" - ")

        let baseName = name
        let variantLabel = name

        if (lastHyphenIndex !== -1) {
            const parsedBase = name.slice(0, lastHyphenIndex).trim()
            const parsedVariant = name.slice(lastHyphenIndex + 3).trim()
            if (parsedBase && parsedVariant) {
                baseName = parsedBase
                variantLabel = parsedVariant
            }
        }

        const groupId = baseName.toLowerCase()

        if (!groupMap.has(groupId)) {
            groupMap.set(groupId, {
                id: groupId,
                name: baseName,
                variants: [],
            })
        }

        groupMap.get(groupId)!.variants.push({
            label: variantLabel,
            product,
        })
    }

    return Array.from(groupMap.values())
}
