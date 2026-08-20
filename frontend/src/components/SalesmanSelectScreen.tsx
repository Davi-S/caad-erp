import {
    ActionIcon,
    Button,
    Center,
    Group,
    Radio,
    ScrollArea,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from "@mantine/core"
import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Users } from "lucide-react"
import { createColumnHelper } from "@tanstack/react-table"
import { ScreenShell } from "./ScreenShell"
import { ListControls } from "./ListControls"
import { useTanStackListControls, type SortOption } from "@/hooks/useTanStackListControls"
import type { Salesman } from "@/types"

interface SalesmanSelectScreenProps {
    salesmen: Salesman[]
    onNext: (salesmanId: string) => void
    title?: string
    confirmLabel?: string
}

// Search and sort configurations
const columnHelper = createColumnHelper<Salesman>()

const SALESMAN_SORT_OPTIONS: SortOption[] = [
    { value: "name-asc", label: "Nome (A-Z)", sorting: [{ id: "name", desc: false }] },
    { value: "name-desc", label: "Nome (Z-A)", sorting: [{ id: "name", desc: true }] },
]

// Generic "pick a salesman before continuing" gate screen.
// Used both by the POS flow (to attribute a sale) and the Stock flow
// (to attribute a restock/write-off), so it lives here instead of inside
// a single feature folder.
export function SalesmanSelectScreen({
    salesmen,
    onNext,
    title = "Quem está operando?",
    confirmLabel = "Continuar",
}: SalesmanSelectScreenProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const navigate = useNavigate()

    // Configure searchable and sortable columns
    const columns = useMemo(
        () => [
            columnHelper.accessor("name", {
                id: "name",
                enableGlobalFilter: true,
            }),
        ],
        [],
    )

    const {
        searchQuery,
        processedItems: processedSalesmen,
        controlsProps,
    } = useTanStackListControls({
        data: salesmen,
        columns,
        sortOptions: SALESMAN_SORT_OPTIONS,
    })

    return (
        <ScreenShell>
            {/* Header */}
            <Group wrap="nowrap">
                <ActionIcon
                    onClick={() => navigate("/")}
                    variant="subtle"
                    size="lg"
                    aria-label="Voltar para o início"
                >
                    <ArrowLeft />
                </ActionIcon>
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Title order={1} size="h2">
                        {title}
                    </Title>
                </Stack>
            </Group>

            {/* Middle Section */}
            <Stack style={{ flex: 1, minHeight: 0 }} py="lg">
                <ListControls {...controlsProps} searchPlaceholder="Buscar vendedor..." />

                {salesmen.length === 0 ? (
                    <Center style={{ flex: 1 }}>
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="light" color="gray" size={48} radius="xl">
                                <Users size={22} />
                            </ThemeIcon>
                            <Text c="dimmed" ta="center">
                                Nenhum vendedor cadastrado ainda.
                            </Text>
                        </Stack>
                    </Center>
                ) : processedSalesmen.length === 0 ? (
                    <Center style={{ flex: 1 }}>
                        <Text c="dimmed" ta="center">
                            Nenhum vendedor encontrado com "{searchQuery}".
                        </Text>
                    </Center>
                ) : (
                    <ScrollArea type="scroll" style={{ flex: 1 }}>
                        <Radio.Group value={selectedId ?? ""} onChange={(id) => setSelectedId(id)}>
                            <Stack gap="sm">
                                {processedSalesmen.map((salesman) => (
                                    <Radio.Card
                                        key={salesman.id}
                                        value={salesman.id}
                                        radius="md"
                                        p="sm"
                                    >
                                        <Group wrap="nowrap">
                                            <Radio.Indicator />
                                            <Text fw={600}>{salesman.name}</Text>
                                        </Group>
                                    </Radio.Card>
                                ))}
                            </Stack>
                        </Radio.Group>
                    </ScrollArea>
                )}
            </Stack>

            {/* Footer */}
            <Button
                disabled={!selectedId}
                onClick={() => selectedId && onNext(selectedId)}
                size="lg"
            >
                {confirmLabel}
            </Button>
        </ScreenShell>
    )
}
