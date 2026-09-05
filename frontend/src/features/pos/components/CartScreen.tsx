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
    TextInput,
    ThemeIcon,
    Title,
} from "@mantine/core"
import { Plus, Minus, ArrowLeft, ShoppingCart, Tag, Pencil, X, FileText } from "lucide-react"
import { createColumnHelper } from "@tanstack/react-table"
import { ScreenShell } from "@/components/ScreenShell"
import { ListControls } from "@/components/ListControls"
import { useTanStackListControls, type SortOption } from "@/hooks/useTanStackListControls"
import { brl } from "@/helpers"
import type { Salesman, Product, Stock } from "@/types"
import { useCart, type CartItem } from "../hooks/useCart"
import { useAppConfig } from "@/config"

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
    const [selectedItemForDiscount, setSelectedItemForDiscount] = useState<CartItem | null>(null)
    const {
        items,
        itemsList,
        subtotal,
        totalItemDiscount,
        netSubtotal,
        discount,
        total,
        notes,
        isEmpty,
        inc,
        dec,
        setItemDiscount,
        clearItemDiscount,
        setDiscount,
        clearDiscount,
        setNotes,
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
            columnHelper.accessor((p) => (items[p.id] ? 1 : 0), {
                id: "cart",
                enableGlobalFilter: false,
            }),
        ],
        [stock, items],
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

    const { config } = useAppConfig()

    const groupedProducts = useMemo(
        () => groupProducts(processedProducts, config.productGroupingDelimiter),
        [processedProducts, config.productGroupingDelimiter],
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
                                        cart={items}
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
                                <ThemeIcon variant="default" size={40} radius="xl">
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
                            {itemsList.map((item, index) => {
                                const itemGrossSubtotal = item.quantity * item.unitPrice
                                const itemNetSubtotal = itemGrossSubtotal - item.discount

                                return (
                                    <div key={item.productId}>
                                        {index > 0 && <Divider variant="dashed" my={4} />}
                                        <Group
                                            justify="space-between"
                                            wrap="nowrap"
                                            align="center"
                                            gap="sm"
                                        >
                                            <Group
                                                gap="xs"
                                                wrap="nowrap"
                                                align="center"
                                                style={{ flex: 1, minWidth: 0 }}
                                            >
                                                <Text size="sm" truncate>
                                                    {item.name}
                                                </Text>
                                                {item.discount > 0 && (
                                                    <Group
                                                        gap={10}
                                                        wrap="nowrap"
                                                        align="center"
                                                        style={{ flexShrink: 0 }}
                                                    >
                                                        <Text size="xs" c="green.7" fw={600}>
                                                            -{brl(item.discount)}
                                                        </Text>
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                            td="line-through"
                                                            ff="monospace"
                                                        >
                                                            {brl(itemGrossSubtotal)}
                                                        </Text>
                                                    </Group>
                                                )}
                                            </Group>
                                            <Group
                                                gap="xs"
                                                wrap="nowrap"
                                                align="center"
                                                style={{ flexShrink: 0 }}
                                            >
                                                <ActionIcon
                                                    variant="subtle"
                                                    color={item.discount > 0 ? "green" : "gray"}
                                                    size="sm"
                                                    onClick={() => setSelectedItemForDiscount(item)}
                                                    title={
                                                        item.discount > 0
                                                            ? "Editar desconto do item"
                                                            : "Adicionar desconto no item"
                                                    }
                                                >
                                                    <Tag size={13} />
                                                </ActionIcon>
                                                <ActionIcon.Group>
                                                    <ActionIcon
                                                        variant="light"
                                                        size="sm"
                                                        onClick={() => dec(item.productId)}
                                                    >
                                                        <Minus size={12} />
                                                    </ActionIcon>
                                                    <ActionIcon.GroupSection
                                                        variant="light"
                                                        size="sm"
                                                        style={{
                                                            width: 28,
                                                            justifyContent: "center",
                                                            textAlign: "center",
                                                        }}
                                                    >
                                                        {item.quantity}
                                                    </ActionIcon.GroupSection>
                                                    <ActionIcon
                                                        variant="light"
                                                        size="sm"
                                                        onClick={() => inc(item.productId)}
                                                    >
                                                        <Plus size={12} />
                                                    </ActionIcon>
                                                </ActionIcon.Group>
                                                <Text
                                                    size="sm"
                                                    fw={600}
                                                    ff="monospace"
                                                    ta="right"
                                                    c={item.discount > 0 ? "green.7" : undefined}
                                                    style={{ width: 90, whiteSpace: "nowrap" }}
                                                >
                                                    {brl(itemNetSubtotal)}
                                                </Text>
                                            </Group>
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
                {totalItemDiscount > 0 || discount > 0 ? (
                    <Stack gap={4}>
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Subtotal
                            </Text>
                            <Text size="sm" ff="monospace">
                                {brl(subtotal)}
                            </Text>
                        </Group>
                        {totalItemDiscount > 0 && (
                            <Group justify="space-between">
                                <Text size="sm" c="green.7" fw={500}>
                                    Descontos nos itens
                                </Text>
                                <Text size="sm" fw={600} c="green.7" ff="monospace">
                                    -{brl(totalItemDiscount)}
                                </Text>
                            </Group>
                        )}
                        {discount > 0 ? (
                            <Group justify="space-between" align="center">
                                <Group gap={6} align="center">
                                    <Text size="sm" c="green.7" fw={500}>
                                        Desconto no carrinho
                                    </Text>
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="xs"
                                        onClick={() => setDiscountModalOpened(true)}
                                        title="Editar desconto no carrinho"
                                    >
                                        <Pencil size={12} />
                                    </ActionIcon>
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        size="xs"
                                        onClick={clearDiscount}
                                        title="Remover desconto no carrinho"
                                    >
                                        <X size={12} />
                                    </ActionIcon>
                                </Group>
                                <Text size="sm" fw={600} c="green.7" ff="monospace">
                                    -{brl(discount)}
                                </Text>
                            </Group>
                        ) : (
                            <Group justify="space-between" align="center">
                                <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    leftSection={<Tag size={13} />}
                                    onClick={() => setDiscountModalOpened(true)}
                                    disabled={isEmpty || netSubtotal === 0}
                                >
                                    Adicionar desconto no carrinho
                                </Button>
                            </Group>
                        )}
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

                <TextInput
                    placeholder="Observações da venda (opcional)"
                    size="xs"
                    leftSection={<FileText size={13} />}
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                />

                <Button size="lg" disabled={isEmpty || total < 0} onClick={onNext}>
                    Prosseguir para o pagamento
                </Button>
            </Stack>

            <DiscountModal
                opened={discountModalOpened}
                onClose={() => setDiscountModalOpened(false)}
                subtotal={netSubtotal}
                currentDiscount={discount}
                onApply={setDiscount}
                onRemove={clearDiscount}
            />

            {selectedItemForDiscount && (
                <DiscountModal
                    opened={!!selectedItemForDiscount}
                    onClose={() => setSelectedItemForDiscount(null)}
                    title={`Desconto no Item: ${selectedItemForDiscount.name}`}
                    subtotal={selectedItemForDiscount.quantity * selectedItemForDiscount.unitPrice}
                    currentDiscount={selectedItemForDiscount.discount}
                    onApply={(discountCents) => {
                        setItemDiscount(selectedItemForDiscount.productId, discountCents)
                        setSelectedItemForDiscount(null)
                    }}
                    onRemove={() => {
                        clearItemDiscount(selectedItemForDiscount.productId)
                        setSelectedItemForDiscount(null)
                    }}
                />
            )}
        </ScreenShell>
    )
}
