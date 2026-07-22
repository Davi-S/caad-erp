import { useEffect } from "react"
import { Modal, NumberInput, SegmentedControl, TextInput, Button, Stack, Group, Text, Divider } from "@mantine/core"
import { useForm } from "@mantine/form"
import { brl } from "@/helpers"
import type { Product } from "@/types"
import { CurrencyInput } from "@/components/CurrencyInput"

interface RestockModalProps {
    opened: boolean
    onClose: () => void
    product: Product | null
    onConfirm: (values: { quantity: number; total_cost: number; notes: string | null }) => void
    isSubmitting: boolean
    error: string | null
}

type CostMode = "unit" | "total"

export function RestockModal({
    opened, onClose, product, onConfirm, isSubmitting, error
}: RestockModalProps) {
    const form = useForm({
        initialValues: {
            cost_mode: "unit" as CostMode,
            quantity: 1,
            unit_cost: 0,
            total_cost: 0,
            notes: "",
        },
        validate: {
            quantity: (value) => (value > 0 ? null : "Informe uma quantidade válida"),
            unit_cost: (value, values) => (values.cost_mode === "unit" && value <= 0 ? "Informe um custo válido" : null),
            total_cost: (value, values) => (values.cost_mode === "total" && value <= 0 ? "Informe um custo válido" : null),
        },
    })

    // Reset the form every time the modal opens for a (possibly new) product
    useEffect(() => {
        if (opened) {
            form.setValues({
                cost_mode: "unit",
                quantity: 1,
                unit_cost: 0,
                total_cost: 0,
                notes: "",
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, product])

    const estimatedTotalCents = Math.round(form.values.quantity * form.values.unit_cost * 100)

    const handleSubmit = form.onSubmit((values) => {
        const totalCostInReais = values.cost_mode === "unit"
            ? values.quantity * values.unit_cost
            : values.total_cost

        onConfirm({
            quantity: values.quantity,
            total_cost: Math.round(totalCostInReais * 100),
            notes: values.notes.trim() || null,
        })
    })

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`Repor estoque: ${product?.product_name ?? ""}`}
            centered
            withCloseButton={false}
            closeOnClickOutside={!isSubmitting}
            closeOnEscape={!isSubmitting}
        >
            <form onSubmit={handleSubmit}>
                <Stack>
                    <NumberInput
                        label="Quantidade"
                        min={1}
                        allowDecimal={false}
                        {...form.getInputProps("quantity")}
                    />

                    <Divider label="Custo da compra" labelPosition="left" />

                    <SegmentedControl
                        fullWidth
                        value={form.values.cost_mode}
                        onChange={(value) => form.setFieldValue("cost_mode", value as CostMode)}
                        data={[
                            { value: "unit", label: "Custo unitário" },
                            { value: "total", label: "Valor da nota" },
                        ]}
                    />

                    {form.values.cost_mode === "unit" ? (
                        <>
                            <CurrencyInput
                                label="Custo unitário"
                                placeholder="R$ 0,00"
                                {...form.getInputProps("unit_cost")}
                            />
                            <Text size="sm" c="dimmed">
                                Total estimado da compra: <Text span fw={600} inherit>{brl(estimatedTotalCents)}</Text>
                            </Text>
                        </>
                    ) : (
                        <CurrencyInput
                            label="Valor total da nota"
                            placeholder="R$ 0,00"
                            {...form.getInputProps("total_cost")}
                        />
                    )}

                    <TextInput
                        label="Observações"
                        placeholder="Opcional"
                        {...form.getInputProps("notes")}
                    />

                    {error && <Text c="red" size="sm">{error}</Text>}

                    <Group justify="flex-end" mt="sm">
                        <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" loading={isSubmitting}>
                            Confirmar reposição
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
