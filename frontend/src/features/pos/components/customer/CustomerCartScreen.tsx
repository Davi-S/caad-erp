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
import type { Products, Stock } from "@/types"
import { groupProducts } from "../../utils/productGrouping"
import { ProductGroupCard } from "../ProductGroupCard"

interface CustomerCartScreenProps {
    products: Products
    stock: Stock
    cart: Record<string, number>
    total: number
    openGroupId?: string | null
}

const noop = () => {}

export function CustomerCartScreen({
    products,
    stock,
    cart,
    total,
    openGroupId,
}: CustomerCartScreenProps) {
    const cartEntries = Object.entries(cart)
    const isEmpty = cartEntries.length === 0

    const sortedProducts = useMemo(() => {
        return [...products].sort((a, b) =>
            (a.name || "").localeCompare(b.name || "", undefined, {
                sensitivity: "base",
                numeric: true,
            }),
        )
    }, [products])

    const groupedProducts = useMemo(() => groupProducts(sortedProducts), [sortedProducts])

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
            <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }} py="lg" px={6}>
                <Stack gap="lg">
                    <Stack gap="sm">
                        <SimpleGrid cols={3} spacing="sm">
                            {groupedProducts.map((group) => (
                                <ProductGroupCard
                                    key={group.id}
                                    group={group}
                                    cart={cart}
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
                            {cartEntries.map(([productId, quantity], index) => {
                                const product = products.find((p) => p.id === productId)
                                if (!product) return null

                                return (
                                    <div key={productId}>
                                        {index > 0 && <Divider variant="dashed" my={4} />}
                                        <Group justify="space-between" wrap="nowrap">
                                            <Text size="sm" style={{ flex: 1 }}>
                                                {product.name}
                                            </Text>
                                            <Text size="sm" c="dimmed" fw={600}>
                                                {quantity}x
                                            </Text>
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
                <Group justify="space-between">
                    <Text fw={600}>Total</Text>
                    <Text fw={700} size="lg" ff="monospace">
                        {brl(total)}
                    </Text>
                </Group>
            </Stack>
        </ScreenShell>
    )
}
