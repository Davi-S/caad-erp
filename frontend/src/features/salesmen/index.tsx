import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
    ActionIcon,
    Alert,
    Badge,
    Card,
    Center,
    Group,
    ScrollArea,
    Stack,
    Switch,
    Text,
    ThemeIcon,
    Title,
} from "@mantine/core"
import { Plus, Pencil, Users, AlertTriangle, ArrowLeft } from "lucide-react"
import { createColumnHelper } from "@tanstack/react-table"
import { ScreenShell } from "@/components/ScreenShell"
import { ListControls } from "@/components/ListControls"
import { useTanStackListControls, type SortOption } from "@/hooks/useTanStackListControls"
import { useSalesmen } from "@/hooks/queries/useSalesmen"
import { useSalesmanFormManager } from "./hooks/useSalesmanFormManager"
import { SalesmanFormModal } from "./components/SalesmanFormModal"
import type { Salesman } from "@/types"

// Search and sort configurations
const columnHelper = createColumnHelper<Salesman>()

const SALESMAN_SORT_OPTIONS: SortOption[] = [
    { value: "name-asc", label: "Nome (A-Z)", sorting: [{ id: "name", desc: false }] },
    { value: "name-desc", label: "Nome (Z-A)", sorting: [{ id: "name", desc: true }] },
]

export function SalesmenManagementPage() {
    const navigate = useNavigate()
    const [showInactive, setShowInactive] = useState(false)
    const { data: salesmen = [], isLoading, isError } = useSalesmen()

    const activeFilteredSalesmen = useMemo(
        () => (showInactive ? salesmen : salesmen.filter((salesman) => salesman.isActive)),
        [salesmen, showInactive],
    )

    // Configure searchable and sortable columns
    const columns = useMemo(
        () => [
            columnHelper.accessor("name", {
                id: "name",
                enableGlobalFilter: true,
            }),
            columnHelper.accessor("id", {
                id: "id",
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
        data: activeFilteredSalesmen,
        columns,
        sortOptions: SALESMAN_SORT_OPTIONS,
    })

    const {
        modalOpened,
        editingSalesman,
        isSubmitting,
        submitError,
        openCreateModal,
        openEditModal,
        closeModal,
        handleCreate,
        handleUpdate,
    } = useSalesmanFormManager()

    return (
        <ScreenShell>
            {/* Header */}
            <Group justify="space-between" wrap="nowrap">
                <Group wrap="nowrap">
                    <ActionIcon onClick={() => navigate("/")} variant="subtle" size="lg">
                        <ArrowLeft />
                    </ActionIcon>
                    <Stack gap={0}>
                        <Text
                            size="xs"
                            fw={600}
                            tt="uppercase"
                            c="dimmed"
                            style={{ letterSpacing: 1 }}
                        >
                            Gerenciamento
                        </Text>
                        <Title order={1} size="h4">
                            Vendedores
                        </Title>
                    </Stack>
                </Group>
                <ActionIcon onClick={openCreateModal} size="lg" radius="xl">
                    <Plus size={20} />
                </ActionIcon>
            </Group>

            {/* Middle Section */}
            <Stack style={{ flex: 1, minHeight: 0 }} py="lg">
                <Switch
                    label="Mostrar vendedores inativos"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.currentTarget.checked)}
                />

                <ListControls {...controlsProps} searchPlaceholder="Buscar por nome ou código..." />

                {isError && (
                    <Alert color="red" icon={<AlertTriangle size={16} />}>
                        Não foi possível carregar os vendedores.
                    </Alert>
                )}

                {isLoading ? (
                    <Center style={{ flex: 1 }}>
                        <Text c="dimmed" size="sm">
                            Carregando...
                        </Text>
                    </Center>
                ) : !processedSalesmen || processedSalesmen.length === 0 ? (
                    <Center style={{ flex: 1 }}>
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="default" size={40} radius="xl">
                                <Users size={20} />
                            </ThemeIcon>
                            <Text c="dimmed" size="sm" ta="center">
                                {searchQuery
                                    ? `Nenhum vendedor encontrado com "${searchQuery}".`
                                    : showInactive
                                      ? "Nenhum vendedor cadastrado ainda."
                                      : "Nenhum vendedor ativo. Ative a opção acima para ver os inativos."}
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }}>
                        <Stack gap="xs">
                            {processedSalesmen.map((salesman) => (
                                <Card
                                    key={salesman.id}
                                    radius="md"
                                    p="sm"
                                    style={{
                                        border: "1px solid var(--mantine-color-default-border)",
                                        background: "transparent",
                                        opacity: salesman.isActive ? 1 : 0.6,
                                    }}
                                >
                                    <Group justify="space-between" wrap="nowrap">
                                        <Stack gap="xs">
                                            <Text fw={600}>{salesman.name}</Text>
                                            <Text size="xs" c="dimmed" ff="monospace">
                                                {salesman.id}
                                            </Text>
                                        </Stack>
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge
                                                variant={salesman.isActive ? "light" : "default"}
                                            >
                                                {salesman.isActive ? "Ativo" : "Inativo"}
                                            </Badge>
                                            <ActionIcon
                                                variant="subtle"
                                                onClick={() => openEditModal(salesman)}
                                            >
                                                <Pencil size={16} />
                                            </ActionIcon>
                                        </Group>
                                    </Group>
                                </Card>
                            ))}
                        </Stack>
                    </ScrollArea>
                )}
            </Stack>

            <SalesmanFormModal
                opened={modalOpened}
                onClose={closeModal}
                salesman={editingSalesman}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
                isSubmitting={isSubmitting}
                error={submitError}
            />
        </ScreenShell>
    )
}
