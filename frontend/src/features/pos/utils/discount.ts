export type DiscountType = "percent" | "fixed"

export interface GlobalDiscount {
    type: DiscountType
    value: number // percent: 1 to 100, fixed: integer cents (>= 0)
}

export interface LineItemForDiscount {
    productId: string
    subtotal: number // in cents
}

/**
 * Calculates the total discount in integer cents based on subtotal and discount config.
 *
 * @param subtotalCents - Gross subtotal before discounts, in integer cents.
 * @param discount - Global discount configuration or null.
 * @returns Total discount amount in integer cents.
 */
export function calculateDiscountAmount(
    subtotalCents: number,
    discount: GlobalDiscount | null,
): number {
    if (!discount || subtotalCents <= 0) return 0
    if (discount.type === "percent") {
        const clampedPercent = Math.min(100, Math.max(0, discount.value))
        return Math.min(subtotalCents, Math.round(subtotalCents * (clampedPercent / 100)))
    }
    return Math.min(subtotalCents, Math.max(0, Math.round(discount.value)))
}

/**
 * Distributes a global discount across line items using the Cumulative Running Balance method
 * (Largest Remainder Method). Guarantees that SUM(distributedDiscounts) === totalDiscountCents
 * with zero cent rounding drift.
 *
 * @param items - List of items with their respective subtotals in cents.
 * @param totalDiscountCents - Total discount to allocate across items, in cents.
 * @returns Mapping of productId to allocated discount amount in cents.
 */
export function distributeDiscount(
    items: LineItemForDiscount[],
    totalDiscountCents: number,
): Record<string, number> {
    const totalSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
    if (totalSubtotal <= 0 || totalDiscountCents <= 0) {
        return Object.fromEntries(items.map((i) => [i.productId, 0]))
    }

    const effectiveTotalDiscount = Math.min(totalSubtotal, totalDiscountCents)
    const discountMap: Record<string, number> = {}
    let cumulativeSubtotal = 0
    let allocatedDiscountSoFar = 0

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        cumulativeSubtotal += item.subtotal

        const cumulativeTarget =
            i === items.length - 1
                ? effectiveTotalDiscount
                : Math.round((cumulativeSubtotal / totalSubtotal) * effectiveTotalDiscount)

        const itemDiscount = cumulativeTarget - allocatedDiscountSoFar
        discountMap[item.productId] = itemDiscount
        allocatedDiscountSoFar = cumulativeTarget
    }

    return discountMap
}
