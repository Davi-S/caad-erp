import { useEffect } from "react"
import { Modal, TextInput, Switch, Button, Stack, Group, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import type { Salesman } from "@/types"

interface SalesmanFormModalProps {
    opened: boolean
    onClose: () => void
    salesman: Salesman | null // null = creating
    onCreate: (values: { id: string; name: string; isActive: boolean }) => void
    onUpdate: (salesmanId: string, values: { name?: string; isActive?: boolean }) => void
    isSubmitting: boolean
    error: string | null
}

export function SalesmanFormModal({
    opened,
    onClose,
    salesman,
    onCreate,
    onUpdate,
    isSubmitting,
    error,
}: SalesmanFormModalProps) {
    const isEditing = salesman !== null

    const form = useForm({
        initialValues: {
            id: "",
            name: "",
            isActive: true,
        },
        validate: {
            id: (value) =>
                isEditing || value.trim().length > 0 ? null : "Informe um identificador",
            name: (value) => (value.trim().length > 0 ? null : "Informe um nome"),
        },
    })

    // Reset/populate the form every time the modal opens
    useEffect(() => {
        if (opened) {
            form.setValues({
                id: salesman?.id ?? "",
                name: salesman?.name ?? "",
                isActive: salesman?.isActive ?? true,
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, salesman])

    const handleSubmit = form.onSubmit((values) => {
        if (isEditing && salesman) {
            onUpdate(salesman.id, {
                name: values.name.trim(),
                isActive: values.isActive,
            })
        } else {
            onCreate({
                id: values.id.trim(),
                name: values.name.trim(),
                isActive: values.isActive,
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
                        placeholder="ex: grr00000000"
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
                        placeholder="Nome do vendedor"
                        description={"Aparece nas telas de seleção."}
                        {...form.getInputProps("name")}
                    />
                    <Switch
                        label="Vendedor ativo"
                        description="Vendedores inativos não aparecem na tela de vendas."
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
