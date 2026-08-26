import { useEffect, useState } from "react"
import { Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text } from "@mantine/core"
import { CurrencyInput } from "@/components/CurrencyInput"
import { brl } from "@/helpers"

interface DiscountModalProps {
    opened: boolean
    onClose: () => void
    subtotal: number
    currentDiscount: number // in cents
    onApply: (discountInCents: number) => void
    onRemove: () => void
}

type DiscountType = "percent" | "fixed"

interface DraftState {
    type: DiscountType
    value: number | string
}

function getInitialDraft(currentDiscount: number, lastApplied: DraftState | null): DraftState {
    if (currentDiscount > 0) {
        return lastApplied ?? { type: "fixed", value: currentDiscount }
    }
    return { type: "percent", value: "" }
}

export function DiscountModal({
    opened,
    onClose,
    subtotal,
    currentDiscount,
    onApply,
    onRemove,
}: DiscountModalProps) {
    const [lastApplied, setLastApplied] = useState<DraftState | null>(null)
    const [draft, setDraft] = useState<DraftState>({ type: "percent", value: "" })

    useEffect(() => {
        if (opened) {
            setDraft(getInitialDraft(currentDiscount, lastApplied))
            if (currentDiscount === 0) {
                setLastApplied(null)
            }
        }
    }, [opened, currentDiscount, lastApplied])

    const num = typeof draft.value === "number" ? draft.value : parseFloat(draft.value) || 0
    const discountCents =
        draft.type === "percent"
            ? Math.round(subtotal * (Math.min(100, Math.max(0, num)) / 100))
            : num

    const isValid =
        num > 0 &&
        discountCents > 0 &&
        discountCents <= subtotal &&
        (draft.type !== "percent" || num <= 100)

    const finalTotal = subtotal - (isValid ? discountCents : 0)

    const handleApply = () => {
        if (!isValid) return
        setLastApplied(draft)
        onApply(discountCents)
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
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    handleApply()
                }}
            >
                <Stack gap="md">
                    <SegmentedControl
                        value={draft.type}
                        onChange={(val) => setDraft({ type: val as DiscountType, value: "" })}
                        data={[
                            { value: "percent", label: "Porcentagem (%)" },
                            { value: "fixed", label: "Valor Fixo (R$)" },
                        ]}
                        fullWidth
                    />

                    {draft.type === "percent" ? (
                        <NumberInput
                            label="Porcentagem de desconto"
                            placeholder="Digite a % (ex: 15)"
                            min={1}
                            max={100}
                            suffix="%"
                            value={draft.value}
                            onChange={(val) =>
                                setDraft({
                                    type: "percent",
                                    value: typeof val === "number" ? val : "",
                                })
                            }
                            autoFocus
                        />
                    ) : (
                        <CurrencyInput
                            label="Valor do desconto"
                            placeholder="R$ 0,00"
                            value={typeof draft.value === "number" ? draft.value : 0}
                            onChange={(val) => setDraft({ type: "fixed", value: val || 0 })}
                            autoFocus
                        />
                    )}

                    <Stack
                        gap={2}
                        p="xs"
                        style={{
                            backgroundColor: "var(--mantine-color-gray-0)",
                            borderRadius: 6,
                        }}
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
                                -{brl(isValid ? discountCents : 0)}
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
                            <Button
                                variant="subtle"
                                color="red"
                                size="sm"
                                onClick={handleRemove}
                                type="button"
                            >
                                Remover desconto
                            </Button>
                        )}
                        <Group gap="xs">
                            <Button variant="default" size="sm" onClick={onClose} type="button">
                                Cancelar
                            </Button>
                            <Button size="sm" type="submit" disabled={!isValid}>
                                Aplicar
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
