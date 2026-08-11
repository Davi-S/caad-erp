import { useMemo } from "react"
import {
    Badge,
    Checkbox,
    Group,
    Indicator,
    Menu,
    Stack,
    Text,
} from "@mantine/core"
import { ChevronDown } from "lucide-react"
import { brl } from "@/helpers"
import type { ProductGroup } from "../utils/productGrouping"

interface ProductGroupCardProps {
    group: ProductGroup
    cart: Record<string, number>
    stock: Record<string, number>
    inc: (productId: string) => void
    removeItem: (productId: string) => void
}

export function ProductGroupCard({
    group,
    cart,
    stock,
    inc,
    removeItem,
}: ProductGroupCardProps) {
    // Standalone product (group with 1 variant)
    if (group.variants.length === 1) {
        const product = group.variants[0].product
        const available = stock[product.product_id]
        const soldOut = available !== undefined && available <= 0
        const quantity = cart[product.product_id] || 0

        return (
            <Indicator
                label={`${quantity}x`}
                size={18}
                disabled={quantity === 0}
                offset={15}
            >
                <Checkbox.Card
                    checked={quantity > 0}
                    onClick={() =>
                        quantity > 0
                            ? removeItem(product.product_id)
                            : inc(product.product_id)
                    }
                    disabled={soldOut}
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
                        <Text size="xs" fw={600} ta="center" truncate style={{ maxWidth: "100%" }}>
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
                                : (stock[product.product_id] ?? 0) + " disp."}
                        </Text>
                    </Stack>
                </Checkbox.Card>
            </Indicator>
        )
    }

    // Consolidated Product Variation Family (variants.length > 1)
    const totalGroupQuantityInCart = useMemo(
        () =>
            group.variants.reduce(
                (sum, v) => sum + (cart[v.product.product_id] || 0),
                0,
            ),
        [group.variants, cart],
    )

    const totalStock = useMemo(
        () =>
            group.variants.reduce(
                (sum, v) => sum + (stock[v.product.product_id] ?? 0),
                0,
            ),
        [group.variants, stock],
    )

    const allVariantsSoldOut = useMemo(
        () =>
            group.variants.every((v) => {
                const avail = stock[v.product.product_id]
                return avail !== undefined && avail <= 0
            }),
        [group.variants, stock],
    )

    // Calculate price display (single price if identical, or min price)
    const priceDisplay = useMemo(() => {
        const prices = group.variants.map((v) => v.product.sell_price)
        const minPrice = Math.min(...prices)
        const maxPrice = Math.max(...prices)
        if (minPrice === maxPrice) {
            return brl(minPrice)
        }
        return `A partir de ${brl(minPrice)}`
    }, [group.variants])

    return (
        <Indicator
            label={`${totalGroupQuantityInCart}x`}
            size={18}
            disabled={totalGroupQuantityInCart === 0}
            offset={15}
        >
            <Menu
                position="bottom"
                withArrow
                shadow="md"
                width={220}
                closeOnItemClick={true}
            >
                <Menu.Target>
                    <Checkbox.Card
                        checked={totalGroupQuantityInCart > 0}
                        disabled={allVariantsSoldOut}
                        radius="md"
                        p="sm"
                        style={{
                            position: "relative",
                            textAlign: "center",
                            cursor: allVariantsSoldOut ? "not-allowed" : "pointer",
                            backgroundColor: allVariantsSoldOut
                                ? "var(--mantine-color-gray-1)"
                                : undefined,
                        }}
                    >
                        <Stack gap={2} align="center">
                            <Group gap={3} justify="center" wrap="nowrap" style={{ maxWidth: "100%", overflow: "hidden" }}>
                                <Text size="xs" fw={600} ta="center" truncate style={{ flexShrink: 1, minWidth: 0 }}>
                                    {group.name}
                                </Text>
                                <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                            </Group>
                            <Text
                                size="xs"
                                fw={700}
                                c={
                                    allVariantsSoldOut
                                        ? "dimmed"
                                        : "var(--mantine-primary-color-filled)"
                                }
                            >
                                {allVariantsSoldOut ? "Esgotado" : priceDisplay}
                            </Text>
                            <Text size="10px" c="dimmed">
                                {allVariantsSoldOut
                                    ? "‎ "
                                    : `${totalStock} disp.`}
                            </Text>
                        </Stack>
                    </Checkbox.Card>
                </Menu.Target>

                <Menu.Dropdown>
                    <Menu.Label>Variações de {group.name}</Menu.Label>
                    {group.variants.map((v) => {
                        const product = v.product
                        const available = stock[product.product_id] ?? 0
                        const soldOut = available <= 0
                        const qty = cart[product.product_id] || 0

                        return (
                            <Menu.Item
                                key={product.product_id}
                                disabled={soldOut}
                                onClick={() => {
                                    if (!soldOut) {
                                        if (qty > 0) {
                                            removeItem(product.product_id)
                                        } else {
                                            inc(product.product_id)
                                        }
                                    }
                                }}
                                style={{ padding: "8px 10px" }}
                            >
                                <Group justify="space-between" align="center" wrap="nowrap">
                                    <Stack gap={0} style={{ minWidth: 0 }}>
                                        <Text size="xs" fw={600} truncate>
                                            {v.label}
                                        </Text>
                                        <Text size="10px" c="dimmed">
                                            {soldOut ? "Esgotado" : `${available} disp.`}
                                        </Text>
                                    </Stack>

                                    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                                        {qty > 0 && (
                                            <Badge size="xs" variant="filled">
                                                {qty}x
                                            </Badge>
                                        )}
                                        <Text size="xs" fw={700} c="var(--mantine-primary-color-filled)">
                                            {brl(product.sell_price)}
                                        </Text>
                                    </Group>
                                </Group>
                            </Menu.Item>
                        )
                    })}
                </Menu.Dropdown>
            </Menu>
        </Indicator>
    )
}
