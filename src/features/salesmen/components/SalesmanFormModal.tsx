import { useEffect } from "react"
import { Modal, TextInput, Switch, Button, Stack, Group, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import type { Salesman } from "@/types"

interface SalesmanFormModalProps {
    opened: boolean
    onClose: () => void
    salesman: Salesman | null // null = creating
    onCreate: (values: { salesman_id: string; salesman_name: string; is_active: boolean }) => void
    onUpdate: (salesmanId: string, values: { salesman_name: string; is_active: boolean }) => void
    isSubmitting: boolean
    error: string | null
}

export function SalesmanFormModal({
    opened, onClose, salesman, onCreate, onUpdate, isSubmitting, error
}: SalesmanFormModalProps) {
    const isEditing = salesman !== null

    const form = useForm({
        initialValues: {
            salesman_id: "",
            salesman_name: "",
            is_active: true,
        },
        validate: {
            salesman_id: (value) => (isEditing || value.trim().length > 0 ? null : "Informe um identificador"),
            salesman_name: (value) => (value.trim().length > 0 ? null : "Informe um nome"),
        },
    })

    // Reset/populate the form every time the modal opens
    useEffect(() => {
        if (opened) {
            form.setValues({
                salesman_id: salesman?.salesman_id ?? "",
                salesman_name: salesman?.salesman_name ?? "",
                is_active: salesman?.is_active ?? true,
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, salesman])

    const handleSubmit = form.onSubmit((values) => {
        if (isEditing && salesman) {
            onUpdate(salesman.salesman_id, {
                salesman_name: values.salesman_name.trim(),
                is_active: values.is_active,
            })
        } else {
            onCreate({
                salesman_id: values.salesman_id.trim(),
                salesman_name: values.salesman_name.trim(),
                is_active: values.is_active,
            })
        }
    })

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={isEditing ? "Editar vendedor" : "Novo vendedor"}
            centered
            withCloseButton={false}
            closeOnClickOutside={!isSubmitting}
            closeOnEscape={!isSubmitting}
        >
            <form onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Identificador"
                        placeholder="ex: joao-silva"
                        disabled={isEditing}
                        description={isEditing ? "O identificador não pode ser alterado." : "Usado como chave única. Não poderá ser alterado depois."}
                        {...form.getInputProps("salesman_id")}
                    />
                    <TextInput
                        label="Nome"
                        placeholder="Nome do vendedor"
                        {...form.getInputProps("salesman_name")}
                    />
                    <Switch
                        label="Vendedor ativo"
                        description="Vendedores inativos não aparecem na tela de vendas."
                        checked={form.values.is_active}
                        onChange={(event) => form.setFieldValue("is_active", event.currentTarget.checked)}
                    />
                    {error && <Text c="red" size="sm">{error}</Text>}
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
