export function normalizeText(text: string): string {
    return (text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
}

/**
 * Multi-word, accent-insensitive search matcher.
 * Splits the search query into tokens and verifies that EVERY token is present
 * in the target text (regardless of order or diacritics).
 */
export function matchesSearch(
    text: string | (string | null | undefined)[],
    searchQuery: string,
): boolean {
    if (!searchQuery || !searchQuery.trim()) return true

    const joinedText = Array.isArray(text) ? text.filter(Boolean).join(" ") : text

    const normalizedText = normalizeText(joinedText)
    const tokens = normalizeText(searchQuery.trim()).split(/\s+/).filter(Boolean)

    if (tokens.length === 0) return true

    // Every token in the query must match somewhere in the text
    return tokens.every((token) => normalizedText.includes(token))
}
