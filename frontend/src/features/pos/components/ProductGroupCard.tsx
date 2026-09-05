import { useMemo } from "react"
import { Checkbox, Group, Indicator, Menu, SimpleGrid, Stack, Text } from "@mantine/core"
import { ChevronDown } from "lucide-react"
import { brl } from "@/helpers"
import type { ProductGroup } from "../utils/productGrouping"
import type { CartItem } from "../hooks/useCart"

interface ProductGroupCardProps {
    group: ProductGroup
    cart: Record<string, CartItem>
    stock: Record<string, number>
    inc: (productId: string) => void
    removeItem: (productId: string) => void
    opened?: boolean
    onOpenChange?: (opened: boolean) => void
    readOnly?: boolean
}

export function ProductGroupCard({
    group,
    cart,
    stock,
    inc,
    removeItem,
    opened,
    onOpenChange,
    readOnly = false,
}: ProductGroupCardProps) {
    // Standalone product (group with 1 variant)
    if (group.variants.length === 1) {
        const product = group.variants[0].product
        const available = stock[product.id]
        const soldOut = available !== undefined && available <= 0
        const quantity = cart[product.id]?.quantity ?? 0

        return (
            <Indicator label={`${quantity}x`} size={18} disabled={quantity === 0} offset={15}>
                <Checkbox.Card
                    checked={quantity > 0}
                    onClick={() => {
                        if (readOnly) return
                        if (quantity > 0) {
                            removeItem(product.id)
                        } else {
                            inc(product.id)
                        }
                    }}
                    disabled={soldOut}
                    radius="md"
                    p="sm"
                    style={{
                        position: "relative",
                        textAlign: "center",
                        backgroundColor: soldOut ? "var(--mantine-color-default-hover)" : undefined,
                        opacity: soldOut ? 0.5 : undefined,
                        borderColor: "var(--mantine-color-default-border)",
                        cursor: readOnly ? "default" : "pointer",
                    }}
                >
                    <Stack gap="xs" align="center">
                        <Text size="xs" fw={600} ta="center" truncate style={{ maxWidth: "100%" }}>
                            {product.name}
                        </Text>
                        <Text
                            size="xs"
                            fw={700}
                            c={soldOut ? "dimmed" : "var(--mantine-primary-color-filled)"}
                        >
                            {soldOut ? "Esgotado" : brl(product.sellPrice)}
                        </Text>
                        <Text size="10px" c="dimmed">
                            {soldOut ? "‎ " : (stock[product.id] ?? 0) + " disp."}
                        </Text>
                    </Stack>
                </Checkbox.Card>
            </Indicator>
        )
    }

    // Consolidated Product Variation Family (variants.length > 1)
    const totalGroupQuantityInCart = useMemo(
        () => group.variants.reduce((sum, v) => sum + (cart[v.product.id]?.quantity ?? 0), 0),
        [group.variants, cart],
    )

    const totalStock = useMemo(
        () => group.variants.reduce((sum, v) => sum + (stock[v.product.id] ?? 0), 0),
        [group.variants, stock],
    )

    const allVariantsSoldOut = useMemo(
        () =>
            group.variants.every((v) => {
                const avail = stock[v.product.id]
                return avail !== undefined && avail <= 0
            }),
        [group.variants, stock],
    )

    // Calculate price display (single price if identical, or min price)
    const priceDisplay = useMemo(() => {
        const prices = group.variants.map((v) => v.product.sellPrice)
        const minPrice = Math.min(...prices)
        const maxPrice = Math.max(...prices)
        if (minPrice === maxPrice) {
            return brl(minPrice)
        }
        return `A partir de ${brl(minPrice)}`
    }, [group.variants])

    const useMultiColumn = group.variants.length > 3
    const dropdownWidth = useMultiColumn ? 480 : 220

    const menuProps = opened !== undefined ? { opened, onChange: onOpenChange } : {}

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
                width={dropdownWidth}
                closeOnItemClick={true}
                {...menuProps}
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
                            opacity: allVariantsSoldOut ? 0.5 : undefined,
                            backgroundColor: allVariantsSoldOut
                                ? "var(--mantine-color-default-hover)"
                                : undefined,
                            borderColor: "var(--mantine-color-default-border)",
                        }}
                    >
                        <Stack gap="xs" align="center">
                            <Group
                                gap="xs"
                                justify="center"
                                wrap="nowrap"
                                style={{ maxWidth: "100%", overflow: "hidden" }}
                            >
                                <Text
                                    size="xs"
                                    fw={600}
                                    ta="center"
                                    truncate
                                    style={{ flexShrink: 1, minWidth: 0 }}
                                >
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
                                {allVariantsSoldOut ? "‎ " : `${totalStock} disp.`}
                            </Text>
                        </Stack>
                    </Checkbox.Card>
                </Menu.Target>

                <Menu.Dropdown p="xs">
                    <Menu.Label
                        pb="xs"
                        style={{
                            position: "sticky",
                            top: 0,
                            backgroundColor: "var(--mantine-color-body)",
                            zIndex: 2,
                        }}
                    >
                        Variações de {group.name}
                    </Menu.Label>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        <SimpleGrid cols={useMultiColumn ? 3 : 1} spacing={6}>
                            {group.variants.map((v) => {
                                const product = v.product
                                const available = stock[product.id] ?? 0
                                const soldOut = available <= 0
                                const qty = cart[product.id]?.quantity ?? 0

                                return (
                                    <Indicator
                                        key={product.id}
                                        label={`${qty}x`}
                                        size={18}
                                        disabled={qty === 0}
                                        offset={15}
                                        style={{ width: "100%", minWidth: 0 }}
                                    >
                                        <Menu.Item
                                            disabled={soldOut}
                                            onClick={() => {
                                                if (readOnly || soldOut) return
                                                if (qty > 0) {
                                                    removeItem(product.id)
                                                } else {
                                                    inc(product.id)
                                                }
                                            }}
                                            styles={{
                                                itemLabel: {
                                                    width: "100%",
                                                    minWidth: 0,
                                                },
                                            }}
                                            style={{
                                                padding: "6px 8px",
                                                borderRadius: "var(--mantine-radius-sm)",
                                                textAlign: "center",
                                                width: "100%",
                                                minWidth: 0,
                                                border:
                                                    qty > 0
                                                        ? "1px solid var(--mantine-primary-color-filled)"
                                                        : "1px solid var(--mantine-color-default-border)",
                                                backgroundColor:
                                                    qty > 0
                                                        ? "var(--mantine-primary-color-light)"
                                                        : soldOut
                                                          ? "var(--mantine-color-default-hover)"
                                                          : undefined,
                                                opacity: soldOut ? 0.5 : undefined,
                                                cursor: readOnly
                                                    ? "default"
                                                    : soldOut
                                                      ? "not-allowed"
                                                      : "pointer",
                                            }}
                                        >
                                            <Stack
                                                gap="xs"
                                                align="center"
                                                style={{
                                                    width: "100%",
                                                    minWidth: 0,
                                                }}
                                            >
                                                <Text
                                                    size="xs"
                                                    fw={600}
                                                    ta="center"
                                                    truncate="end"
                                                    style={{ width: "100%" }}
                                                >
                                                    {v.label}
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
                                                    {soldOut ? "Esgotado" : brl(product.sellPrice)}
                                                </Text>
                                                <Text size="10px" c="dimmed">
                                                    {soldOut ? "‎ " : `${available} disp.`}
                                                </Text>
                                            </Stack>
                                        </Menu.Item>
                                    </Indicator>
                                )
                            })}
                        </SimpleGrid>
                    </div>
                </Menu.Dropdown>
            </Menu>
        </Indicator>
    )
}
