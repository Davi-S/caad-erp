import { useState, useMemo } from "react"
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
import { ArrowLeft, PackagePlus, PackageMinus, Package, AlertTriangle } from "lucide-react"
import { createColumnHelper } from "@tanstack/react-table"
import { ScreenShell } from "@/components/ScreenShell"
import { ListControls } from "@/components/ListControls"
import { useTanStackListControls, type SortOption } from "@/hooks/useTanStackListControls"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"
import { useRestock, useWriteOff } from "../hooks/useStockMutations"
import { RestockModal } from "./RestockModal"
import { WriteOffModal } from "./WriteOffModal"
import type { Product, Salesman } from "@/types"

interface StockManagementScreenProps {
    salesman: Salesman
    onSwitchSalesman: () => void
}

// Search and sort configurations
const columnHelper = createColumnHelper<Product>()

const STOCK_SORT_OPTIONS: SortOption[] = [
    { value: "name-asc", label: "Nome (A-Z)", sorting: [{ id: "name", desc: false }] },
    { value: "name-desc", label: "Nome (Z-A)", sorting: [{ id: "name", desc: true }] },
    { value: "stock-asc", label: "Estoque (Menor)", sorting: [{ id: "stock", desc: false }] },
    { value: "stock-desc", label: "Estoque (Maior)", sorting: [{ id: "stock", desc: true }] },
]

export function StockManagementScreen({ salesman, onSwitchSalesman }: StockManagementScreenProps) {
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
        sortOptions: STOCK_SORT_OPTIONS,
    })

    const [restockingProduct, setRestockingProduct] = useState<Product | null>(null)
    const [writingOffProduct, setWritingOffProduct] = useState<Product | null>(null)

    const restockMutation = useRestock()
    const writeOffMutation = useWriteOff()

    const openRestock = (product: Product) => {
        restockMutation.reset()
        setRestockingProduct(product)
    }

    const openWriteOff = (product: Product) => {
        writeOffMutation.reset()
        setWritingOffProduct(product)
    }

    const handleConfirmRestock = (values: {
        quantity: number
        totalCost: number
        notes: string | null
    }) => {
        if (!restockingProduct) return
        restockMutation.mutate(
            {
                productId: restockingProduct.id,
                salesmanId: salesman.id,
                quantity: values.quantity,
                totalCost: values.totalCost,
                notes: values.notes,
            },
            { onSuccess: () => setRestockingProduct(null) },
        )
    }

    const handleConfirmWriteOff = (values: { quantity: number; notes: string | null }) => {
        if (!writingOffProduct) return
        writeOffMutation.mutate(
            {
                productId: writingOffProduct.id,
                salesmanId: salesman.id,
                quantity: values.quantity,
                notes: values.notes,
            },
            { onSuccess: () => setWritingOffProduct(null) },
        )
    }

    return (
        <ScreenShell>
            {/* Header */}
            <Group wrap="nowrap">
                <ActionIcon onClick={onSwitchSalesman} variant="subtle" size="lg">
                    <ArrowLeft />
                </ActionIcon>
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                        Gerenciamento
                    </Text>
                    <Title order={1} size="h4">
                        Estoque
                    </Title>
                </Stack>
                <Badge variant="light">{salesman.name}</Badge>
            </Group>

            {/* Middle Section */}
            <Stack style={{ flex: 1, minHeight: 0 }} py="lg">
                <Group justify="space-between" align="center">
                    <Switch
                        label="Mostrar produtos inativos"
                        checked={showInactive}
                        onChange={(event) => setShowInactive(event.currentTarget.checked)}
                    />
                </Group>

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
                            {processedProducts.map((product) => {
                                const quantity = stock[product.id] ?? 0
                                const soldOut = quantity <= 0

                                return (
                                    <Group
                                        key={product.id}
                                        justify="space-between"
                                        wrap="nowrap"
                                        p="sm"
                                        style={{
                                            border: "1px solid var(--mantine-color-gray-3)",
                                            borderRadius: "var(--mantine-radius-md)",
                                            opacity: product.isActive ? 1 : 0.6,
                                        }}
                                    >
                                        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                                            <Text fw={600} truncate>
                                                {product.name}
                                            </Text>
                                            <Badge
                                                size="sm"
                                                variant="light"
                                                color={soldOut ? "red" : undefined}
                                                w="fit-content"
                                            >
                                                {quantity} em estoque
                                            </Badge>
                                        </Stack>
                                        <Group gap="xs" wrap="nowrap">
                                            <ActionIcon
                                                variant="light"
                                                onClick={() => openRestock(product)}
                                                aria-label="Repor estoque"
                                            >
                                                <PackagePlus size={16} />
                                            </ActionIcon>
                                            <ActionIcon
                                                variant="light"
                                                color="red"
                                                onClick={() => openWriteOff(product)}
                                                disabled={soldOut}
                                                aria-label="Dar baixa"
                                            >
                                                <PackageMinus size={16} />
                                            </ActionIcon>
                                        </Group>
                                    </Group>
                                )
                            })}
                        </Stack>
                    </ScrollArea>
                )}
            </Stack>

            <RestockModal
                opened={restockingProduct !== null}
                onClose={() => setRestockingProduct(null)}
                product={restockingProduct}
                onConfirm={handleConfirmRestock}
                isSubmitting={restockMutation.isPending}
                error={restockMutation.isError ? restockMutation.error.message : null}
            />

            <WriteOffModal
                opened={writingOffProduct !== null}
                onClose={() => setWritingOffProduct(null)}
                product={writingOffProduct}
                availableQuantity={writingOffProduct ? (stock[writingOffProduct.id] ?? 0) : 0}
                onConfirm={handleConfirmWriteOff}
                isSubmitting={writeOffMutation.isPending}
                error={writeOffMutation.isError ? writeOffMutation.error.message : null}
            />
        </ScreenShell>
    )
}
