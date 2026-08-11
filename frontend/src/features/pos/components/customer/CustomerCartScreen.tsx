import {
    Center,
    Divider,
    Group,
    Indicator,
    Paper,
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

interface CustomerCartScreenProps {
    products: Products
    stock: Stock
    cart: Record<string, number>
    total: number
}

export function CustomerCartScreen({ products, stock, cart, total }: CustomerCartScreenProps) {
    const cartEntries = Object.entries(cart)
    const isEmpty = cartEntries.length === 0

    return (
        <ScreenShell>
            {/* Header */}
            <Group justify="space-between" align="center">
                <Stack gap={0}>
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>
                        Venda em andamento
                    </Text>
                    <Title order={1} size="h5">
                        Catálogo de Produtos
                    </Title>
                </Stack>
            </Group>

            {/* Middle Section */}
            <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }} py="lg">
                <Stack gap="lg">
                    <Stack gap="sm">
                        <Text
                            size="xs"
                            fw={600}
                            tt="uppercase"
                            c="dimmed"
                            style={{ letterSpacing: 1 }}
                        >
                            Produtos
                        </Text>
                        <SimpleGrid cols={3} spacing="sm">
                            {products.map((product) => {
                                const available = stock[product.product_id]
                                const soldOut = available !== undefined && available <= 0
                                const quantity = cart[product.product_id] || 0

                                return (
                                    <Indicator
                                        key={product.product_id}
                                        label={`${quantity}x`}
                                        size={18}
                                        disabled={quantity === 0}
                                        offset={6}
                                    >
                                        <Paper
                                            withBorder
                                            radius="md"
                                            p="sm"
                                            style={{
                                                position: "relative",
                                                textAlign: "center",
                                                backgroundColor: soldOut
                                                    ? "var(--mantine-color-gray-1)"
                                                    : undefined,
                                            }}
                                        >
                                            <Stack gap={2} align="center">
                                                <Text size="xs" fw={600} ta="center">
                                                    {product.product_name}
                                                </Text>
                                                <Text
                                                    size="xs"
                                                    fw={700}
                                                    c={
                                                        soldOut
                                                            ? "dimmed"
                                                            : "var(--mantine-primary-color-filled)"
                                                    }
                                                >
                                                    {soldOut ? "Esgotado" : brl(product.sell_price)}
                                                </Text>
                                                <Text size="10px" c="dimmed">
                                                    {soldOut
                                                        ? "‎ "
                                                        : (available !== undefined
                                                              ? available
                                                              : 0) + " disp."}
                                                </Text>
                                            </Stack>
                                        </Paper>
                                    </Indicator>
                                )
                            })}
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
                                const product = products.find((p) => p.product_id === productId)
                                if (!product) return null

                                return (
                                    <div key={productId}>
                                        {index > 0 && <Divider variant="dashed" my={4} />}
                                        <Group justify="space-between" wrap="nowrap">
                                            <Text size="sm" style={{ flex: 1 }}>
                                                {product.product_name}
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
            </Stack>
        </ScreenShell>
    )
}
