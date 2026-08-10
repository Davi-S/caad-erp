import { useMemo, useState } from "react"
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    type ColumnDef,
    type SortingState,
    type FilterFn,
} from "@tanstack/react-table"
import { matchesSearch } from "@/helpers"

// Custom accent-insensitive and multi-word global filter function for TanStack Table
export const accentGlobalFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
    const cellValue = row.getValue(columnId)
    if (cellValue !== undefined && cellValue !== null) {
        if (matchesSearch(String(cellValue), String(filterValue))) {
            return true
        }
    }
    const allCellValues = row
        .getAllCells()
        .map((cell) => cell.getValue())
        .filter((val) => val !== undefined && val !== null)
        .map(String)

    return matchesSearch(allCellValues, String(filterValue))
}

export interface SortOption<K extends string = string> {
    value: K
    label: string
    sorting: SortingState
}

export interface UseTanStackListOptions<T, K extends string = string> {
    data: T[] | undefined | null
    columns: ColumnDef<T, any>[]
    sortOptions?: SortOption<K>[]
    initialSortKey?: K
}

export function useTanStackListControls<T, K extends string = string>({
    data,
    columns,
    sortOptions = [],
    initialSortKey,
}: UseTanStackListOptions<T, K>) {
    const defaultSortKey = initialSortKey ?? sortOptions[0]?.value
    const [selectedSortKey, setSelectedSortKey] = useState<K | undefined>(defaultSortKey)
    const [globalFilter, setGlobalFilter] = useState("")

    // Find active TanStack SortingState from selected key
    const activeSortingState = useMemo(() => {
        const found = sortOptions.find((o) => o.value === selectedSortKey)
        return found ? found.sorting : []
    }, [sortOptions, selectedSortKey])

    const safeData = useMemo(() => data ?? [], [data])

    const table = useReactTable({
        data: safeData,
        columns,
        state: {
            sorting: activeSortingState,
            globalFilter,
        },
        onGlobalFilterChange: setGlobalFilter,
        globalFilterFn: accentGlobalFilterFn,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
    })

    const processedItems = useMemo(
        () => table.getRowModel().rows.map((row) => row.original),
        [table.getRowModel().rows],
    )

    const uiSortOptions = useMemo(
        () => sortOptions.map((o) => ({ value: o.value, label: o.label })),
        [sortOptions],
    )

    return {
        searchQuery: globalFilter,
        setSearchQuery: setGlobalFilter,
        selectedSortKey,
        setSelectedSortKey,
        processedItems,
        table,
        controlsProps: {
            searchQuery: globalFilter,
            onSearchChange: setGlobalFilter,
            sortValue: selectedSortKey,
            onSortChange: (val: K) => setSelectedSortKey(val),
            sortOptions: uiSortOptions,
        },
    }
}
