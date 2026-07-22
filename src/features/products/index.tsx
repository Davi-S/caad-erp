import { useState } from "react"
import {
    ActionIcon, Alert, Badge, Center, Group,
    ScrollArea, Stack, Switch, Text, ThemeIcon, Title
} from "@mantine/core"
import { Plus, Pencil, Package, AlertTriangle } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import { brl } from "@/helpers"
import { useProducts } from "@/hooks/queries/useProducts"
import { useStock } from "@/hooks/queries/useStock"
import { useCreateProduct, useUpdateProduct } from "./hooks/useProductsMutations"
import { ProductFormModal } from "./components/ProductFormModal"
import type { Product } from "@/types"

export function ProductsManagementPage() {
    const [showInactive, setShowInactive] = useState(false)
    const { data: products, isLoading, isError } = useProducts()
    const { data: stock } = useStock()

    // Filter the products on the client side
    const filteredProducts = showInactive
        ? products
        : products?.filter(product => product.is_active)

    const [modalOpened, setModalOpened] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)

    const createMutation = useCreateProduct()
    const updateMutation = useUpdateProduct()

    const isSubmitting = createMutation.isPending || updateMutation.isPending
    const submitError = createMutation.isError
        ? createMutation.error.message
        : updateMutation.isError
            ? updateMutation.error.message
            : null

    const openCreateModal = () => {
        setEditingProduct(null)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const openEditModal = (product: Product) => {
        setEditingProduct(product)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const handleCreate = (values: { product_id: string; product_name: string; sell_price: number; is_active: boolean }) => {
        createMutation.mutate(values, { onSuccess: () => setModalOpened(false) })
    }

    const handleUpdate = (productId: string, values: { product_name: string; sell_price: number; is_active: boolean }) => {
        updateMutation.mutate({ productId, input: values }, { onSuccess: () => setModalOpened(false) })
    }

    return (
        <ScreenShell>
            {/* Header */}
            <Group justify="space-between" wrap="nowrap">
                <Stack gap={0}>
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                        Gerenciamento
                    </Text>
                    <Title order={1} size="h4">Produtos</Title>
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

                {isError && (
                    <Alert color="red" icon={<AlertTriangle size={16} />}>
                        Não foi possível carregar os produtos.
                    </Alert>
                )}

                {isLoading ? (
                    <Center style={{ flex: 1 }}>
                        <Text c="dimmed" size="sm">Carregando...</Text>
                    </Center>
                ) : !filteredProducts || filteredProducts.length === 0 ? (
                    <Center style={{ flex: 1 }}>
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="light" color="gray" size={40} radius="xl">
                                <Package size={20} />
                            </ThemeIcon>
                            <Text c="dimmed" size="sm" ta="center">
                                {showInactive
                                    ? "Nenhum produto cadastrado ainda."
                                    : "Nenhum produto ativo. Ative a opção acima para ver os inativos."}
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }}>
                        <Stack gap="xs">
                            {filteredProducts.map((product) => (
                                <Group
                                    key={product.product_id}
                                    justify="space-between"
                                    wrap="nowrap"
                                    p="sm"
                                    style={{
                                        border: "1px solid var(--mantine-color-gray-3)",
                                        borderRadius: "var(--mantine-radius-md)",
                                        opacity: product.is_active ? 1 : 0.6,
                                    }}
                                >
                                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                        <Text fw={600} truncate>{product.product_name}</Text>
                                        <Text size="xs" c="dimmed" ff="monospace">{product.product_id}</Text>
                                    </Stack>
                                    <Stack gap={2} align="flex-end">
                                        <Text fw={600} ff="monospace" size="sm">{brl(product.sell_price)}</Text>
                                        <Text size="xs" c="dimmed">
                                            {stock?.[product.product_id] ?? 0} em estoque
                                        </Text>
                                    </Stack>
                                    <Group gap="xs" wrap="nowrap">
                                        <Badge
                                            color={product.is_active ? "var(--mantine-primary-color-filled)" : "gray"}
                                            variant={product.is_active ? "light" : "outline"}
                                        >
                                            {product.is_active ? "Ativo" : "Inativo"}
                                        </Badge>
                                        <ActionIcon variant="subtle" onClick={() => openEditModal(product)}>
                                            <Pencil size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Group>
                            ))}
                        </Stack>
                    </ScrollArea>
                )}
            </Stack>

            <ProductFormModal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                product={editingProduct}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
                isSubmitting={isSubmitting}
                error={submitError}
            />
        </ScreenShell>
    )
}
