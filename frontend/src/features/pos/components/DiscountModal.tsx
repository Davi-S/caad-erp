import { useEffect, useState } from "react"
import { Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text } from "@mantine/core"
import { CurrencyInput } from "@/components/CurrencyInput"
import { brl } from "@/helpers"

interface DiscountConfig {
    type: "percent" | "fixed"
    value: number
}

interface DiscountModalProps {
    opened: boolean
    onClose: () => void
    subtotal: number
    currentDiscount: number // in cents
    onApply: (discountInCents: number) => void
    onRemove: () => void
}

type DiscountInputType = "percent" | "fixed"

export function DiscountModal({
    opened,
    onClose,
    subtotal,
    currentDiscount,
    onApply,
    onRemove,
}: DiscountModalProps) {
    const [lastApplied, setLastApplied] = useState<DiscountConfig | null>(null)
    const [type, setType] = useState<DiscountInputType>("percent")
    const [percentValue, setPercentValue] = useState<number | string>("")
    const [fixedBrl, setFixedBrl] = useState<number>(0)

    useEffect(() => {
        if (opened) {
            if (currentDiscount > 0 && lastApplied) {
                setType(lastApplied.type)
                if (lastApplied.type === "percent") {
                    setPercentValue(lastApplied.value)
                    setFixedBrl(0)
                } else {
                    setFixedBrl(lastApplied.value / 100)
                    setPercentValue("")
                }
            } else if (currentDiscount > 0) {
                setType("fixed")
                setFixedBrl(currentDiscount / 100)
                setPercentValue("")
            } else {
                setLastApplied(null)
                setType("percent")
                setPercentValue("")
                setFixedBrl(0)
            }
        }
    }, [opened, currentDiscount, lastApplied])

    const fixedCents = Math.round(fixedBrl * 100)
    const numericPercent = typeof percentValue === "number" ? percentValue : 0
    const percentCents =
        numericPercent > 0 && numericPercent <= 100
            ? Math.round(subtotal * (numericPercent / 100))
            : 0

    const calculatedDiscountAmount = type === "percent" ? percentCents : fixedCents
    const isPercentValid =
        typeof percentValue === "number" &&
        percentValue > 0 &&
        percentValue <= 100 &&
        percentCents > 0 &&
        percentCents <= subtotal
    const isFixedValid = fixedCents > 0 && fixedCents <= subtotal
    const isValid = type === "percent" ? isPercentValid : isFixedValid
    const finalTotal = subtotal - (isValid ? calculatedDiscountAmount : 0)

    const handleApply = () => {
        if (!isValid) return
        setLastApplied({
            type,
            value: type === "percent" ? numericPercent : fixedCents,
        })
        onApply(calculatedDiscountAmount)
        onClose()
    }

    const handleRemove = () => {
        setLastApplied(null)
        onRemove()
        onClose()
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Text fw={600} size="md">
                    Desconto no Carrinho
                </Text>
            }
            centered
            size="sm"
        >
            <Stack gap="md">
                <SegmentedControl
                    value={type}
                    onChange={(val) => setType(val as DiscountInputType)}
                    data={[
                        { value: "percent", label: "Porcentagem (%)" },
                        { value: "fixed", label: "Valor Fixo (R$)" },
                    ]}
                    fullWidth
                />

                {type === "percent" ? (
                    <NumberInput
                        label="Porcentagem de desconto"
                        placeholder="Digite a % (ex: 15)"
                        min={1}
                        max={100}
                        suffix="%"
                        value={percentValue}
                        onChange={(val) => setPercentValue(typeof val === "number" ? val : "")}
                        autoFocus
                    />
                ) : (
                    <CurrencyInput
                        label="Valor do desconto"
                        placeholder="R$ 0,00"
                        value={fixedBrl}
                        onChange={(val) => setFixedBrl(val || 0)}
                        autoFocus
                    />
                )}

                <Stack
                    gap={2}
                    p="xs"
                    style={{ backgroundColor: "var(--mantine-color-gray-0)", borderRadius: 6 }}
                >
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed">
                            Subtotal:
                        </Text>
                        <Text size="xs" fw={500} ff="monospace">
                            {brl(subtotal)}
                        </Text>
                    </Group>
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed">
                            Desconto:
                        </Text>
                        <Text size="xs" fw={600} c="green.7" ff="monospace">
                            -{brl(isValid ? calculatedDiscountAmount : 0)}
                        </Text>
                    </Group>
                    <Group
                        justify="space-between"
                        mt={4}
                        pt={4}
                        style={{ borderTop: "1px dashed var(--mantine-color-gray-3)" }}
                    >
                        <Text size="xs" fw={700}>
                            Total com desconto:
                        </Text>
                        <Text
                            size="sm"
                            fw={700}
                            ff="monospace"
                            c="var(--mantine-primary-color-filled)"
                        >
                            {brl(finalTotal)}
                        </Text>
                    </Group>
                </Stack>

                <Group justify={currentDiscount > 0 ? "space-between" : "flex-end"} mt="xs">
                    {currentDiscount > 0 && (
                        <Button variant="subtle" color="red" size="sm" onClick={handleRemove}>
                            Remover desconto
                        </Button>
                    )}
                    <Group gap="xs">
                        <Button variant="default" size="sm" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleApply} disabled={!isValid}>
                            Aplicar
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Modal>
    )
}
