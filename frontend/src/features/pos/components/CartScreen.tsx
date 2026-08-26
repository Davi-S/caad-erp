import { useMemo, useState } from "react"
import {
    ActionIcon,
    Button,
    Center,
    Divider,
    Group,
    ScrollArea,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from "@mantine/core"
import { Plus, Minus, ArrowLeft, ShoppingCart, Tag, Pencil, X } from "lucide-react"
import { createColumnHelper } from "@tanstack/react-table"
import { ScreenShell } from "@/components/ScreenShell"
import { ListControls } from "@/components/ListControls"
import { useTanStackListControls, type SortOption } from "@/hooks/useTanStackListControls"
import { brl } from "@/helpers"
import type { Salesman, Product, Stock } from "@/types"
import { useCart } from "../hooks/useCart"

import { groupProducts } from "../utils/productGrouping"
import { ProductGroupCard } from "./ProductGroupCard"
import { DiscountModal } from "./DiscountModal"

interface CartScreenProps {
    salesman: Salesman | null
    products: Product[]
    stock: Stock
    cartState: ReturnType<typeof useCart>
    openGroupId?: string | null
    onOpenGroupIdChange?: (groupId: string | null) => void
    actions: {
        onBack: () => void
        onNext: () => void
    }
}

// Search and sort configurations
const columnHelper = createColumnHelper<Product>()

const PRODUCT_SORT_OPTIONS: SortOption[] = [
    { value: "name-asc", label: "Nome (A-Z)", sorting: [{ id: "name", desc: false }] },
    { value: "name-desc", label: "Nome (Z-A)", sorting: [{ id: "name", desc: true }] },
    { value: "price-asc", label: "Preço (Menor)", sorting: [{ id: "price", desc: false }] },
    { value: "price-desc", label: "Preço (Maior)", sorting: [{ id: "price", desc: true }] },
    { value: "stock-desc", label: "Estoque (Maior)", sorting: [{ id: "stock", desc: true }] },
    {
        value: "cart-first",
        label: "No Carrinho",
        sorting: [
            { id: "cart", desc: true },
            { id: "name", desc: false },
        ],
    },
]

export function CartScreen({
    salesman,
    products,
    stock,
    cartState,
    openGroupId,
    onOpenGroupIdChange,
    actions,
}: CartScreenProps) {
    const [discountModalOpened, setDiscountModalOpened] = useState(false)
    const {
        cart,
        cartIterable,
        subtotal,
        discount,
        total,
        isEmpty,
        inc,
        dec,
        setDiscount,
        clearDiscount,
        removeItem,
    } = cartState
    const { onBack, onNext } = actions

    // Configure searchable and sortable columns
    const columns = useMemo(
        () => [
            columnHelper.accessor("name", {
                id: "name",
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
            columnHelper.accessor((p) => (cart[p.id] ? 1 : 0), {
                id: "cart",
                enableGlobalFilter: false,
            }),
        ],
        [stock, cart],
    )

    const {
        searchQuery,
        processedItems: processedProducts,
        controlsProps,
    } = useTanStackListControls({
        data: products,
        columns,
        sortOptions: PRODUCT_SORT_OPTIONS,
    })

    const groupedProducts = useMemo(() => groupProducts(processedProducts), [processedProducts])

    return (
        <ScreenShell>
            {/* Header */}
            <Group wrap="nowrap">
                <ActionIcon onClick={onBack} variant="subtle" size="lg">
                    <ArrowLeft />
                </ActionIcon>
                <Stack gap={0}>
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                        Venda em andamento
                    </Text>
                    <Title order={1} size="h5">
                        Venda de {salesman?.name ?? ""}
                    </Title>
                </Stack>
            </Group>

            {/* Middle Section */}
            <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }} py="lg" px={6}>
                <Stack gap="lg">
                    <Stack gap="sm">
                        <ListControls {...controlsProps} searchPlaceholder="Buscar produto..." />
                        {groupedProducts.length === 0 ? (
                            <Text size="xs" c="dimmed" ta="center" py="xs">
                                Nenhum produto encontrado com "{searchQuery}".
                            </Text>
                        ) : (
                            <SimpleGrid cols={3} spacing="sm">
                                {groupedProducts.map((group) => (
                                    <ProductGroupCard
                                        key={group.id}
                                        group={group}
                                        cart={cart}
                                        stock={stock}
                                        inc={inc}
                                        removeItem={removeItem}
                                        opened={openGroupId === group.id}
                                        onOpenChange={(isOpen) =>
                                            onOpenGroupIdChange?.(isOpen ? group.id : null)
                                        }
                                    />
                                ))}
                            </SimpleGrid>
                        )}
                    </Stack>

                    {isEmpty ? (
                        <Center py="xl">
                            <Stack align="center" gap="xs">
                                <ThemeIcon variant="light" color="gray" size={40} radius="xl">
                                    <ShoppingCart size={20} />
                                </ThemeIcon>
                                <Text c="dimmed" size="sm" ta="center">
                                    Nenhum item ainda.
                                </Text>
                            </Stack>
                        </Center>
                    ) : (
                        <Stack gap={4}>
                            <Text
                                size="xs"
                                fw={600}
                                tt="uppercase"
                                c="dimmed"
                                style={{ letterSpacing: 1 }}
                            >
                                No carrinho
                            </Text>
                            {cartIterable.map(([productId, quantity], index) => {
                                const product = products.find((p) => p.id === productId)
                                if (!product) return null
                                return (
                                    <div key={productId}>
                                        {index > 0 && <Divider variant="dashed" my={4} />}
                                        <Group justify="space-between" wrap="nowrap">
                                            <Text size="sm" style={{ flex: 1 }}>
                                                {product.name}
                                            </Text>
                                            <ActionIcon.Group>
                                                <ActionIcon
                                                    variant="light"
                                                    size="sm"
                                                    onClick={() => dec(productId)}
                                                >
                                                    <Minus size={12} />
                                                </ActionIcon>
                                                <ActionIcon.GroupSection variant="light" size="sm">
                                                    {quantity}
                                                </ActionIcon.GroupSection>
                                                <ActionIcon
                                                    variant="light"
                                                    size="sm"
                                                    onClick={() => inc(productId)}
                                                >
                                                    <Plus size={12} />
                                                </ActionIcon>
                                            </ActionIcon.Group>
                                            <Text
                                                size="sm"
                                                fw={600}
                                                ff="monospace"
                                                w={72}
                                                ta="right"
                                            >
                                                {brl(quantity * product.sellPrice)}
                                            </Text>
                                        </Group>
                                    </div>
                                )
                            })}
                        </Stack>
                    )}
                </Stack>
            </ScrollArea>

            {/* Footer */}
            <Stack gap="xs">
                <Divider />
                {discount > 0 ? (
                    <Stack gap={4}>
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Subtotal
                            </Text>
                            <Text size="sm" ff="monospace">
                                {brl(subtotal)}
                            </Text>
                        </Group>
                        <Group justify="space-between" align="center">
                            <Group gap={6} align="center">
                                <Text size="sm" c="green.7" fw={500}>
                                    Desconto
                                </Text>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="xs"
                                    onClick={() => setDiscountModalOpened(true)}
                                    title="Editar desconto"
                                >
                                    <Pencil size={12} />
                                </ActionIcon>
                                <ActionIcon
                                    variant="subtle"
                                    color="red"
                                    size="xs"
                                    onClick={clearDiscount}
                                    title="Remover desconto"
                                >
                                    <X size={12} />
                                </ActionIcon>
                            </Group>
                            <Text size="sm" fw={600} c="green.7" ff="monospace">
                                -{brl(discount)}
                            </Text>
                        </Group>
                        <Divider variant="dashed" my={2} />
                        <Group justify="space-between">
                            <Text fw={600}>Total</Text>
                            <Text fw={700} size="lg" ff="monospace">
                                {brl(total)}
                            </Text>
                        </Group>
                    </Stack>
                ) : (
                    <Stack gap="xs">
                        <Group justify="space-between" align="center">
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                leftSection={<Tag size={13} />}
                                onClick={() => setDiscountModalOpened(true)}
                                disabled={isEmpty}
                            >
                                Adicionar desconto
                            </Button>
                            <Group gap="xs">
                                <Text fw={600}>Total</Text>
                                <Text fw={700} size="lg" ff="monospace">
                                    {brl(total)}
                                </Text>
                            </Group>
                        </Group>
                    </Stack>
                )}

                <Button size="lg" disabled={isEmpty || total < 0} onClick={onNext}>
                    Prosseguir para o pagamento
                </Button>
            </Stack>

            <DiscountModal
                opened={discountModalOpened}
                onClose={() => setDiscountModalOpened(false)}
                subtotal={subtotal}
                currentDiscount={discount}
                onApply={setDiscount}
                onRemove={clearDiscount}
            />
        </ScreenShell>
    )
}
