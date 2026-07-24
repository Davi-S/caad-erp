import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
    ActionIcon,
    Alert,
    Badge,
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
import { ScreenShell } from "@/components/ScreenShell"
import { useSalesmen } from "@/hooks/queries/useSalesmen"
import { useCreateSalesman, useUpdateSalesman } from "./hooks/useSalesmenMutations"
import { SalesmanFormModal } from "./components/SalesmanFormModal"
import type { Salesman } from "@/types"

export function SalesmenManagementPage() {
    const navigate = useNavigate()
    const [showInactive, setShowInactive] = useState(false)
    const { data: salesmen, isLoading, isError } = useSalesmen()
    // Filter the salesmen on the client side
    const filteredSalesmen = showInactive
        ? salesmen
        : salesmen?.filter((salesman) => salesman.is_active)

    const [modalOpened, setModalOpened] = useState(false)
    const [editingSalesman, setEditingSalesman] = useState<Salesman | null>(null)

    const createMutation = useCreateSalesman()
    const updateMutation = useUpdateSalesman()

    const isSubmitting = createMutation.isPending || updateMutation.isPending
    const submitError = createMutation.isError
        ? createMutation.error.message
        : updateMutation.isError
            ? updateMutation.error.message
            : null

    const openCreateModal = () => {
        setEditingSalesman(null)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const openEditModal = (salesman: Salesman) => {
        setEditingSalesman(salesman)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const handleCreate = (values: {
        salesman_id: string
        salesman_name: string
        is_active: boolean
    }) => {
        createMutation.mutate(values, { onSuccess: () => setModalOpened(false) })
    }

    const handleUpdate = (
        salesmanId: string,
        values: { salesman_name: string; is_active: boolean },
    ) => {
        updateMutation.mutate(
            { salesmanId, input: values },
            { onSuccess: () => setModalOpened(false) },
        )
    }

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
                ) : !filteredSalesmen || filteredSalesmen.length === 0 ? (
                    <Center style={{ flex: 1 }}>
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="light" color="gray" size={40} radius="xl">
                                <Users size={20} />
                            </ThemeIcon>
                            <Text c="dimmed" size="sm" ta="center">
                                {showInactive
                                    ? "Nenhum vendedor cadastrado ainda."
                                    : "Nenhum vendedor ativo. Ative a opção acima para ver os inativos."}
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }}>
                        <Stack gap="xs">
                            {filteredSalesmen.map((salesman) => (
                                <Group
                                    key={salesman.salesman_id}
                                    justify="space-between"
                                    wrap="nowrap"
                                    p="sm"
                                    style={{
                                        border: "1px solid var(--mantine-color-gray-3)",
                                        borderRadius: "var(--mantine-radius-md)",
                                        opacity: salesman.is_active ? 1 : 0.6,
                                    }}
                                >
                                    <Stack gap={2}>
                                        <Text fw={600}>{salesman.salesman_name}</Text>
                                        <Text size="xs" c="dimmed" ff="monospace">
                                            {salesman.salesman_id}
                                        </Text>
                                    </Stack>
                                    <Group gap="xs" wrap="nowrap">
                                        <Badge
                                            color={
                                                salesman.is_active
                                                    ? "var(--mantine-primary-color-filled)"
                                                    : "gray"
                                            }
                                            variant={salesman.is_active ? "light" : "outline"}
                                        >
                                            {salesman.is_active ? "Ativo" : "Inativo"}
                                        </Badge>
                                        <ActionIcon
                                            variant="subtle"
                                            onClick={() => openEditModal(salesman)}
                                        >
                                            <Pencil size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Group>
                            ))}
                        </Stack>
                    </ScrollArea>
                )}
            </Stack>

            <SalesmanFormModal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                salesman={editingSalesman}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
                isSubmitting={isSubmitting}
                error={submitError}
            />
        </ScreenShell>
    )
}
