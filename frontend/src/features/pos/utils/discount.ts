export interface LineItemForDiscount {
    productId: string
    subtotal: number // in cents
}

/**
 * Distributes a global discount in cents across line items using the Cumulative
 * Running Balance method (Largest Remainder Method).
 *
 * Guarantees that SUM(distributedDiscounts) === totalDiscountCents with 0 cent drift.
 *
 * @param items - List of items with their respective subtotals in cents.
 * @param totalDiscount - Total discount to allocate across items, in cents.
 * @returns Mapping of productId to allocated discount amount in cents.
 * @throws {RangeError} If totalDiscountCents is negative or exceeds total subtotal.
 */
export function distributeDiscount(
    items: LineItemForDiscount[],
    totalDiscount: number,
): Record<string, number> {
    if (totalDiscount < 0) {
        throw new RangeError("Total discount cannot be negative")
    }

    const totalSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
    if (totalDiscount > totalSubtotal) {
        throw new RangeError("Total discount cannot exceed total subtotal")
    }

    if (totalSubtotal === 0 || totalDiscount === 0) {
        return Object.fromEntries(items.map((i) => [i.productId, 0]))
    }

    const discountMap: Record<string, number> = {}
    let cumulativeSubtotal = 0
    let allocatedDiscountSoFar = 0

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        cumulativeSubtotal += item.subtotal

        const cumulativeTarget =
            i === items.length - 1
                ? totalDiscount
                : Math.round((cumulativeSubtotal / totalSubtotal) * totalDiscount)

        const itemDiscount = cumulativeTarget - allocatedDiscountSoFar
        discountMap[item.productId] = itemDiscount
        allocatedDiscountSoFar = cumulativeTarget
    }

    return discountMap
}
