import { useEffect } from "react"
import { Modal, NumberInput, TextInput, Button, Stack, Group, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import type { Product } from "@/types"

interface WriteOffModalProps {
    opened: boolean
    onClose: () => void
    product: Product | null
    availableQuantity: number
    onConfirm: (values: { quantity: number; notes: string | null }) => void
    isSubmitting: boolean
    error: string | null
}

export function WriteOffModal({
    opened,
    onClose,
    product,
    availableQuantity,
    onConfirm,
    isSubmitting,
    error,
}: WriteOffModalProps) {
    const form = useForm({
        initialValues: {
            quantity: 1,
            notes: "",
        },
        validate: {
            quantity: (value) => {
                if (value <= 0) return "Informe uma quantidade válida"
                if (value > availableQuantity) return `Apenas ${availableQuantity}u disponíveis`
                return null
            },
        },
    })

    // Reset the form every time the modal opens for a (possibly new) product
    useEffect(() => {
        if (opened) {
            form.setValues({ quantity: 1, notes: "" })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, product])

    const handleSubmit = form.onSubmit((values) => {
        onConfirm({
            quantity: values.quantity,
            notes: values.notes.trim() || null,
        })
    })

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`Dar baixa: ${product?.product_name ?? ""}`}
            centered
            withCloseButton={false}
            closeOnClickOutside={!isSubmitting}
            closeOnEscape={!isSubmitting}
        >
            <form onSubmit={handleSubmit}>
                <Stack>
                    <Text size="sm" c="dimmed">
                        {availableQuantity}u disponíveis em estoque
                    </Text>

                    <NumberInput
                        label="Quantidade a remover"
                        min={1}
                        max={availableQuantity}
                        allowDecimal={false}
                        {...form.getInputProps("quantity")}
                    />

                    <TextInput
                        label="Motivo"
                        placeholder="ex: produto vencido, quebra, perda"
                        {...form.getInputProps("notes")}
                    />

                    {error && (
                        <Text c="red" size="sm">
                            {error}
                        </Text>
                    )}

                    <Group justify="flex-end" mt="sm">
                        <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" color="red" loading={isSubmitting}>
                            Confirmar baixa
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
