import { useEffect } from "react"
import { Modal, TextInput, Switch, Button, Stack, Group, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import type { Product } from "@/types"
import { CurrencyInput } from "@/components/CurrencyInput" // Assuming path

interface ProductFormModalProps {
    opened: boolean
    onClose: () => void
    product: Product | null // null = creating
    onCreate: (values: {
        product_id: string
        product_name: string
        sell_price: number
        is_active: boolean
    }) => void
    onUpdate: (
        productId: string,
        values: { product_name: string; sell_price: number; is_active: boolean },
    ) => void
    isSubmitting: boolean
    error: string | null
}

export function ProductFormModal({
    opened,
    onClose,
    product,
    onCreate,
    onUpdate,
    isSubmitting,
    error,
}: ProductFormModalProps) {
    const isEditing = product !== null

    const form = useForm({
        initialValues: {
            product_id: "",
            product_name: "",
            sell_price: 0,
            is_active: true,
        },
        validate: {
            product_id: (value) =>
                isEditing || value.trim().length > 0 ? null : "Informe um identificador",
            product_name: (value) => (value.trim().length > 0 ? null : "Informe um nome"),
            sell_price: (value) => (value > 0 ? null : "Informe um preço válido"),
        },
    })

    // Reset/populate the form every time the modal opens
    useEffect(() => {
        if (opened) {
            form.setValues({
                product_id: product?.product_id ?? "",
                product_name: product?.product_name ?? "",
                sell_price: product ? product.sell_price / 100 : 0,
                is_active: product?.is_active ?? true,
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, product])

    const handleSubmit = form.onSubmit((values) => {
        const sellPriceInCents = Math.round(values.sell_price * 100)

        if (isEditing && product) {
            onUpdate(product.product_id, {
                product_name: values.product_name.trim(),
                sell_price: sellPriceInCents,
                is_active: values.is_active,
            })
        } else {
            onCreate({
                product_id: values.product_id.trim(),
                product_name: values.product_name.trim(),
                sell_price: sellPriceInCents,
                is_active: values.is_active,
            })
        }
    })

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={isEditing ? "Editar produto" : "Novo produto"}
            centered
            withCloseButton={false}
            closeOnClickOutside={!isSubmitting}
            closeOnEscape={!isSubmitting}
        >
            <form onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Identificador"
                        placeholder="ex: cerveja-lata"
                        disabled={isEditing}
                        description={
                            isEditing
                                ? "O identificador não pode ser alterado."
                                : "Usado como chave única. Não poderá ser alterado depois."
                        }
                        {...form.getInputProps("product_id")}
                    />
                    <TextInput
                        label="Nome"
                        placeholder="Nome do produto"
                        {...form.getInputProps("product_name")}
                    />
                    <CurrencyInput
                        label="Preço de venda"
                        placeholder="R$ 0,00"
                        {...form.getInputProps("sell_price")}
                    />
                    <Switch
                        label="Produto ativo"
                        description="Produtos inativos não aparecem na tela de vendas."
                        checked={form.values.is_active}
                        onChange={(event) =>
                            form.setFieldValue("is_active", event.currentTarget.checked)
                        }
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
                        <Button type="submit" loading={isSubmitting}>
                            {isEditing ? "Salvar" : "Criar"}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
