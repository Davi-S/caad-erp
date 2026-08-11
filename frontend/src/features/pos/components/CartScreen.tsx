import { useMemo } from "react"
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
import { Plus, Minus, ArrowLeft, ShoppingCart } from "lucide-react"
import { createColumnHelper } from "@tanstack/react-table"
import { ScreenShell } from "@/components/ScreenShell"
import { ListControls } from "@/components/ListControls"
import { useTanStackListControls, type SortOption } from "@/hooks/useTanStackListControls"
import { brl } from "@/helpers"
import type { Salesman, Product, Products, Stock } from "@/types"
import { useCart } from "../hooks/useCart"

import { groupProducts } from "../utils/productGrouping"
import { ProductGroupCard } from "./ProductGroupCard"

interface CartScreenProps {
    salesman: Salesman
    products: Products
    stock: Stock
    cartState: ReturnType<typeof useCart>
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

export function CartScreen({ salesman, products, stock, cartState, actions }: CartScreenProps) {
    const { cart, cartIterable, total, isEmpty, inc, dec, removeItem } = cartState
    const { onBack, onNext } = actions

    // Configure searchable and sortable columns
    const columns = useMemo(
        () => [
            columnHelper.accessor("product_name", {
                id: "name",
                enableGlobalFilter: true,
            }),
            columnHelper.accessor("sell_price", {
                id: "price",
                enableGlobalFilter: false,
            }),
            columnHelper.accessor((p) => stock[p.product_id] ?? 0, {
                id: "stock",
                enableGlobalFilter: false,
            }),
            columnHelper.accessor((p) => (cart[p.product_id] ? 1 : 0), {
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

    const groupedProducts = useMemo(
        () => groupProducts(processedProducts),
        [processedProducts],
    )

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
                        Venda de {salesman.salesman_name}
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
                                const product = products.find((p) => p.product_id === productId)
                                if (!product) return null
                                return (
                                    <div key={productId}>
                                        {index > 0 && <Divider variant="dashed" my={4} />}
                                        <Group justify="space-between" wrap="nowrap">
                                            <Text size="sm" style={{ flex: 1 }}>
                                                {product.product_name}
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
                                                {brl(quantity * product.sell_price)}
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
                <Group justify="space-between">
                    <Text fw={600}>Total</Text>
                    <Text fw={700} size="lg" ff="monospace">
                        {brl(total)}
                    </Text>
                </Group>
                <Button size="lg" disabled={total === 0} onClick={onNext}>
                    Prosseguir para o pagamento
                </Button>
            </Stack>
        </ScreenShell>
    )
}
