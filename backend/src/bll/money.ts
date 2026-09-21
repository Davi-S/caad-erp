/**
 * Splitting amounts of money without losing or inventing cents.
 *
 * Every amount is an integer number of cents. These are pure helpers: they are
 * given already-valid numbers and treat anything else as a bug, not as bad user
 * input (which the commands reject before getting here).
 */

/**
 * Splits `total` across `weights` so the parts add up to `total` exactly.
 *
 * Uses the largest-remainder method on a running balance: each part is the
 * difference between the rounded cumulative share and what has been given out so
 * far, so the rounding error never accumulates and the last part absorbs what is
 * left.
 *
 * It splits whatever it is given, including a total larger than the weights or a
 * negative weight; the result is then proportional but not meaningful, and it is
 * up to the caller's rules to reject it.
 *
 * @param weights - What each part is proportional to (line subtotals).
 * @param total - Amount to split.
 * @returns One amount per weight, summing to `total`.
 */
export function distribute(weights: number[], total: number): number[] {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    if (total === 0) {
        return weights.map(() => 0)
    }
    if (totalWeight === 0) {
        // Nothing to be proportional to: the first part takes it all
        return weights.map((_, position) => (position === 0 ? total : 0))
    }

    const parts: number[] = []
    let cumulativeWeight = 0
    let given = 0

    for (const [position, weight] of weights.entries()) {
        cumulativeWeight += weight
        const target =
            position === weights.length - 1
                ? total
                : Math.round((cumulativeWeight / totalWeight) * total)
        parts.push(target - given)
        given = target
    }

    return parts
}

/**
 * The share of `amount` that corresponds to `part` out of `whole`, rounded to the
 * cent.
 *
 * Used for partial reversals. Callers must take the remaining amount, not this
 * share, when reversing the last part, so no cent is left behind.
 *
 * @param amount - Amount being shared out.
 * @param part - How much of the whole is taken.
 * @param whole - The whole, greater than 0.
 * @returns The rounded share.
 */
export function shareOf(amount: number, part: number, whole: number): number {
    if (whole <= 0) {
        throw new RangeError("Cannot take a share of nothing")
    }
    return Math.round((amount * part) / whole)
}
