export function slugify(str: string) {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "")
}

export function brl(n: number) {
    return "R$ " + n.toFixed(2).replace(".", ",")
}

// Deterministic mock QR pattern (visual only, not a real payload)
const QR_SIZE = 11
export function buildQrGrid() {
    const grid = []
    for (let r = 0; r < QR_SIZE; r++) {
        const row = []
        for (let c = 0; c < QR_SIZE; c++) {
            const isFinderBlock =
                (r < 3 && c < 3) || (r < 3 && c >= QR_SIZE - 3) || (r >= QR_SIZE - 3 && c < 3)
            let filled
            if (isFinderBlock) {
                const lr = r < 3 ? r : r - (QR_SIZE - 3)
                const lc = c < 3 ? c : c - (QR_SIZE - 3)
                filled = lr === 0 || lr === 2 || lc === 0 || lc === 2 || (lr === 1 && lc === 1)
            } else {
                filled = (r * 13 + c * 7 + r * c) % 5 < 2
            }
            row.push(filled)
        }
        grid.push(row)
    }
    return grid
}
