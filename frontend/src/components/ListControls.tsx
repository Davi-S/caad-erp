import { ActionIcon, Group, Select, TextInput } from "@mantine/core"
import { Search, X, ArrowUpDown } from "lucide-react"

export interface SortOption<T extends string = string> {
    value: T
    label: string
}

interface ListControlsProps<T extends string = string> {
    searchQuery: string
    onSearchChange: (value: string) => void
    searchPlaceholder?: string
    sortValue?: T
    onSortChange?: (value: T) => void
    sortOptions?: SortOption<T>[]
    sortPlaceholder?: string
}

export function ListControls<T extends string = string>({
    searchQuery,
    onSearchChange,
    searchPlaceholder = "Buscar...",
    sortValue,
    onSortChange,
    sortOptions,
    sortPlaceholder = "Ordenar por",
}: ListControlsProps<T>) {
    return (
        <Group wrap="wrap" gap="xs">
            <TextInput
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                leftSection={<Search size={16} />}
                rightSection={
                    searchQuery ? (
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={() => onSearchChange("")}
                            aria-label="Limpar busca"
                        >
                            <X size={14} />
                        </ActionIcon>
                    ) : null
                }
                style={{ flex: 1, minWidth: 180 }}
                size="sm"
            />
            {sortOptions && sortOptions.length > 0 && onSortChange && (
                <Select
                    value={sortValue ?? null}
                    onChange={(val) => val && onSortChange(val as T)}
                    data={sortOptions}
                    placeholder={sortPlaceholder}
                    leftSection={<ArrowUpDown size={16} />}
                    size="sm"
                    allowDeselect={false}
                    style={{ width: 170, minWidth: 130 }}
                />
            )}
        </Group>
    )
}
