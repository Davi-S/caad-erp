import { useEffect } from "react"
import { Modal, TextInput, Switch, Button, Stack, Group, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import type { Product } from "@/types"
import { CurrencyInput } from "@/components/CurrencyInput"
import { useAppConfig } from "@/config"

interface ProductFormModalProps {
    opened: boolean
    onClose: () => void
    product: Product | null // null = creating
    onCreate: (values: { id: string; name: string; sellPrice: number; isActive: boolean }) => void
    onUpdate: (
        productId: string,
        values: { name?: string; sellPrice?: number; isActive?: boolean },
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
    const { config } = useAppConfig()
    const isEditing = product !== null

    const form = useForm({
        initialValues: {
            id: "",
            name: "",
            sellPrice: 0,
            isActive: true,
        },
        validate: {
            id: (value) =>
                isEditing || value.trim().length > 0 ? null : "Informe um identificador",
            name: (value) => (value.trim().length > 0 ? null : "Informe um nome"),
            sellPrice: (value) => (value >= 0 ? null : "Informe um preço válido"),
        },
    })

    // Reset/populate the form every time the modal opens
    useEffect(() => {
        if (opened) {
            form.setValues({
                id: product?.id ?? "",
                name: product?.name ?? "",
                sellPrice: product ? product.sellPrice : 0,
                isActive: product?.isActive ?? true,
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, product])

    const handleSubmit = form.onSubmit((values) => {
        if (isEditing && product) {
            onUpdate(product.id, {
                name: values.name.trim(),
                sellPrice: values.sellPrice,
                isActive: values.isActive,
            })
        } else {
            onCreate({
                id: values.id.trim(),
                name: values.name.trim(),
                sellPrice: values.sellPrice,
                isActive: values.isActive,
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
                        placeholder="ex: fanta-laranja-lata-350ml"
                        disabled={isEditing}
                        description={
                            isEditing
                                ? "O identificador não pode ser alterado."
                                : "Usado como chave única. Não poderá ser alterado depois. Quanto mais detalhado, melhor."
                        }
                        {...form.getInputProps("id")}
                    />
                    <TextInput
                        label="Nome"
                        placeholder="Nome do produto"
                        description={
                            config.productGroupingDelimiter
                                ? `Aparece na tela de vendas. Use "${config.productGroupingDelimiter}" para separar variações do mesmo produto.`
                                : "Aparece na tela de vendas."
                        }
                        {...form.getInputProps("name")}
                    />
                    <CurrencyInput
                        label="Preço de venda"
                        placeholder="R$ 0,00"
                        {...form.getInputProps("sellPrice")}
                    />
                    <Switch
                        label="Produto ativo"
                        description="Produtos inativos não aparecem na tela de vendas."
                        checked={form.values.isActive}
                        onChange={(event) =>
                            form.setFieldValue("isActive", event.currentTarget.checked)
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
