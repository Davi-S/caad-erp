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
import { Plus, Pencil, Package, AlertTriangle, ArrowLeft } from "lucide-react"
import { createColumnHelper } from "@tanstack/react-table"
import { ScreenShell } from "@/components/ScreenShell"
import { ListControls } from "@/components/ListControls"
import { useTanStackListControls, type SortOption } from "@/hooks/useTanStackListControls"
import { brl } from "@/helpers"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"
import { useProductFormManager } from "./hooks/useProductFormManager"
import { ProductFormModal } from "./components/ProductFormModal"
import type { Product } from "@/types"

// Search and sort configurations
const columnHelper = createColumnHelper<Product>()

const PRODUCT_SORT_OPTIONS: SortOption[] = [
    { value: "name-asc", label: "Nome (A-Z)", sorting: [{ id: "name", desc: false }] },
    { value: "name-desc", label: "Nome (Z-A)", sorting: [{ id: "name", desc: true }] },
    { value: "price-asc", label: "Preço (Menor)", sorting: [{ id: "price", desc: false }] },
    { value: "price-desc", label: "Preço (Maior)", sorting: [{ id: "price", desc: true }] },
    { value: "stock-asc", label: "Estoque (Menor)", sorting: [{ id: "stock", desc: false }] },
    { value: "stock-desc", label: "Estoque (Maior)", sorting: [{ id: "stock", desc: true }] },
]

export function ProductsManagementPage() {
    const navigate = useNavigate()
    const [showInactive, setShowInactive] = useState(false)
    const { data: products = [], isLoading, isError } = useProducts()
    const { data: stock = {} } = useStock()

    const activeFilteredProducts = useMemo(
        () => (showInactive ? products : products.filter((product) => product.isActive)),
        [products, showInactive],
    )

    // Configure searchable and sortable columns
    const columns = useMemo(
        () => [
            columnHelper.accessor("name", {
                id: "name",
                enableGlobalFilter: true,
            }),
            columnHelper.accessor("id", {
                id: "code",
                enableGlobalFilter: true,
            }),
            columnHelper.accessor("sellPrice", {
                id: "price",
                enableGlobalFilter: false,
            }),
            columnHelper.accessor((p) => stock[p.id] ?? 0, {
                id: "stock",
                enableGlobalFilter: false,
            }),
        ],
        [stock],
    )

    const {
        searchQuery,
        processedItems: processedProducts,
        controlsProps,
    } = useTanStackListControls({
        data: activeFilteredProducts,
        columns,
        sortOptions: PRODUCT_SORT_OPTIONS,
    })

    const {
        modalOpened,
        editingProduct,
        isSubmitting,
        submitError,
        openCreateModal,
        openEditModal,
        closeModal,
        handleCreate,
        handleUpdate,
    } = useProductFormManager()

    return (
        <ScreenShell>
            {/* Header */}
            <Group wrap="nowrap">
                <ActionIcon onClick={() => navigate("/")} variant="subtle" size="lg">
                    <ArrowLeft />
                </ActionIcon>
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                        Gerenciamento
                    </Text>
                    <Title order={1} size="h4">
                        Produtos
                    </Title>
                </Stack>
                <ActionIcon onClick={openCreateModal} size="lg" radius="xl">
                    <Plus size={20} />
                </ActionIcon>
            </Group>

            {/* Middle Section */}
            <Stack style={{ flex: 1, minHeight: 0 }} py="lg">
                <Switch
                    label="Mostrar produtos inativos"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.currentTarget.checked)}
                />

                <ListControls {...controlsProps} searchPlaceholder="Buscar por nome ou código..." />

                {isError && (
                    <Alert color="red" icon={<AlertTriangle size={16} />}>
                        Não foi possível carregar os produtos.
                    </Alert>
                )}

                {isLoading ? (
                    <Center style={{ flex: 1 }}>
                        <Text c="dimmed" size="sm">
                            Carregando...
                        </Text>
                    </Center>
                ) : !processedProducts || processedProducts.length === 0 ? (
                    <Center style={{ flex: 1 }}>
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="light" color="gray" size={40} radius="xl">
                                <Package size={20} />
                            </ThemeIcon>
                            <Text c="dimmed" size="sm" ta="center">
                                {searchQuery
                                    ? `Nenhum produto encontrado com "${searchQuery}".`
                                    : showInactive
                                      ? "Nenhum produto cadastrado ainda."
                                      : "Nenhum produto ativo. Ative a opção acima para ver os inativos."}
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }}>
                        <Stack gap="xs">
                            {processedProducts.map((product) => (
                                <Card
                                    key={product.id}
                                    radius="md"
                                    p="sm"
                                    style={{
                                        border: "1px solid var(--mantine-color-default-border)",
                                        background: "transparent",
                                        opacity: product.isActive ? 1 : 0.6,
                                    }}
                                >
                                    <Group justify="space-between" wrap="nowrap">
                                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                            <Text fw={600} truncate>
                                                {product.name}
                                            </Text>
                                            <Text size="xs" c="dimmed" ff="monospace">
                                                {product.id}
                                            </Text>
                                        </Stack>
                                        <Stack gap={2} align="flex-end">
                                            <Text fw={600} ff="monospace" size="sm">
                                                {brl(product.sellPrice)}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {stock[product.id] ?? 0} em estoque
                                            </Text>
                                        </Stack>
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge variant={product.isActive ? "light" : "default"}>
                                                {product.isActive ? "Ativo" : "Inativo"}
                                            </Badge>
                                            <ActionIcon
                                                variant="subtle"
                                                onClick={() => openEditModal(product)}
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

            <ProductFormModal
                opened={modalOpened}
                onClose={closeModal}
                product={editingProduct}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
                isSubmitting={isSubmitting}
                error={submitError}
            />
        </ScreenShell>
    )
}
