import { useMemo } from "react"
import {
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
import { ShoppingCart } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import { brl } from "@/helpers"
import { useAppConfig } from "@/config"
import type { Product, Stock } from "@/types"
import { groupProducts } from "../../utils/productGrouping"
import { ProductGroupCard } from "../ProductGroupCard"
import type { CartItem } from "../../hooks/useCart"

interface CustomerCartScreenProps {
    products: Product[]
    stock: Stock
    items: Record<string, CartItem>
    total: number
    subtotal?: number
    totalItemDiscount?: number
    discount?: number
    openGroupId?: string | null
}

const noop = () => {}

export function CustomerCartScreen({
    products,
    stock,
    items,
    total,
    subtotal,
    totalItemDiscount = 0,
    discount = 0,
    openGroupId,
}: CustomerCartScreenProps) {
    const itemsList = Object.values(items)
    const isEmpty = itemsList.length === 0
    const totalSavings = totalItemDiscount + discount

    const sortedProducts = useMemo(() => {
        return [...products].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
                sensitivity: "base",
                numeric: true,
            }),
        )
    }, [products])

    const { config } = useAppConfig()

    const groupedProducts = useMemo(
        () => groupProducts(sortedProducts, config.productGroupingDelimiter),
        [sortedProducts, config.productGroupingDelimiter],
    )

    return (
        <ScreenShell>
            {/* Header */}
            <Group justify="space-between" align="center">
                <Stack gap={0}>
                    <Title order={1} size="h5">
                        Catálogo de Produtos
                    </Title>
                </Stack>
            </Group>

            {/* Middle Section */}
            <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }} py="lg" px="xs">
                <Stack gap="lg">
                    <Stack gap="sm">
                        <SimpleGrid cols={3} spacing="sm">
                            {groupedProducts.map((group) => (
                                <ProductGroupCard
                                    key={group.id}
                                    group={group}
                                    cart={items}
                                    stock={stock}
                                    inc={noop}
                                    removeItem={noop}
                                    opened={openGroupId === group.id}
                                    readOnly={true}
                                />
                            ))}
                        </SimpleGrid>
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
                        <Stack gap="xs">
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
                                const itemGross = item.quantity * item.unitPrice
                                const itemNet = itemGross - item.discount

                                return (
                                    <div key={item.productId}>
                                        {index > 0 && <Divider variant="dashed" my="xs" />}
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
                                                        gap="xs"
                                                        wrap="nowrap"
                                                        align="center"
                                                        style={{ flexShrink: 0 }}
                                                    >
                                                        <Text size="xs" c="var(--mantine-color-green-text)" fw={600}>
                                                            -{brl(item.discount)}
                                                        </Text>
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                            td="line-through"
                                                            ff="monospace"
                                                        >
                                                            {brl(itemGross)}
                                                        </Text>
                                                    </Group>
                                                )}
                                            </Group>
                                            <Group
                                                gap="md"
                                                wrap="nowrap"
                                                align="center"
                                                style={{ flexShrink: 0 }}
                                            >
                                                <Text
                                                    size="sm"
                                                    c="dimmed"
                                                    fw={600}
                                                    ta="center"
                                                    style={{ width: 28 }}
                                                >
                                                    {item.quantity}x
                                                </Text>
                                                <Text
                                                    size="sm"
                                                    fw={600}
                                                    ff="monospace"
                                                    ta="right"
                                                    c={item.discount > 0 ? "green.7" : undefined}
                                                    style={{ width: 90, whiteSpace: "nowrap" }}
                                                >
                                                    {brl(itemNet)}
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
                {totalSavings > 0 ? (
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Subtotal
                            </Text>
                            <Text size="sm" ff="monospace">
                                {brl(subtotal || total + totalSavings)}
                            </Text>
                        </Group>
                        <Group justify="space-between">
                            <Text size="sm" c="var(--mantine-color-green-text)" fw={500}>
                                Economia total
                            </Text>
                            <Text size="sm" fw={600} c="var(--mantine-color-green-text)" ff="monospace">
                                -{brl(totalSavings)}
                            </Text>
                        </Group>
                        <Divider variant="dashed" my="xs" />
                        <Group justify="space-between">
                            <Text fw={600}>Total</Text>
                            <Text fw={700} size="lg" ff="monospace">
                                {brl(total)}
                            </Text>
                        </Group>
                    </Stack>
                ) : (
                    <Group justify="space-between">
                        <Text fw={600}>Total</Text>
                        <Text fw={700} size="lg" ff="monospace">
                            {brl(total)}
                        </Text>
                    </Group>
                )}
            </Stack>
        </ScreenShell>
    )
}
