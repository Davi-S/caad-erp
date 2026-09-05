/**
 * Modal component allowing users to upload an Excel .xlsx workbook to replace the database.
 */

import { useState } from "react"
import { Alert, Button, FileButton, Group, Modal, Stack, Text, ThemeIcon } from "@mantine/core"
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react"
import { useImportWorkbook, type ImportWorkbookResult } from "../hooks/useWorkbookActions"

interface ImportWorkbookModalProps {
    opened: boolean
    onClose: () => void
}

export function ImportWorkbookModal({ opened, onClose }: ImportWorkbookModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [result, setResult] = useState<ImportWorkbookResult | null>(null)
    const importMutation = useImportWorkbook()

    const handleCloseModal = () => {
        setFile(null)
        setResult(null)
        importMutation.reset()
        onClose()
    }

    const handleImport = () => {
        if (!file) return
        importMutation.mutate(file, {
            onSuccess: (data) => {
                setResult(data)
            },
        })
    }

    return (
        <Modal
            opened={opened}
            onClose={handleCloseModal}
            title={
                <Group gap="xs">
                    <ThemeIcon variant="light" size="md">
                        <Upload size={18} />
                    </ThemeIcon>
                    <Text fw={600}>Importar Planilha Excel</Text>
                </Group>
            }
            centered
            size="md"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Selecione um arquivo <strong>.xlsx</strong> contendo as abas <em>Products</em>,{" "}
                    <em>Salesmen</em> e <em>TransactionLog</em>.
                </Text>

                <Alert
                    variant="light"
                    color="amber"
                    title="Atenção"
                    icon={<AlertCircle size={18} />}
                >
                    A importação <strong>substituirá completamente</strong> todos os dados atuais do
                    banco de dados pelos registros da planilha.
                </Alert>

                {importMutation.isError && (
                    <Alert
                        variant="light"
                        color="red"
                        title="Erro na importação"
                        icon={<AlertCircle size={18} />}
                    >
                        {importMutation.error.message}
                    </Alert>
                )}

                {result && (
                    <Alert
                        variant="light"
                        color="green"
                        title="Importação concluída com sucesso!"
                        icon={<CheckCircle2 size={18} />}
                    >
                        <Stack gap={2} mt="xs">
                            <Text size="xs">
                                • <strong>{result.productsCount}</strong> produtos importados
                            </Text>
                            <Text size="xs">
                                • <strong>{result.salesmenCount}</strong> vendedores importados
                            </Text>
                            <Text size="xs">
                                • <strong>{result.transactionsCount}</strong> transações registradas
                            </Text>
                        </Stack>
                    </Alert>
                )}

                {!result && (
                    <Group
                        justify="center"
                        p="md"
                        style={{
                            border: "2px dashed var(--mantine-color-default-border)",
                            borderRadius: "var(--mantine-radius-md)",
                        }}
                    >
                        <Stack align="center" gap="xs">
                            <FileSpreadsheet size={36} color="var(--mantine-color-dimmed)" />
                            {file ? (
                                <Text fw={600} size="sm" c="var(--mantine-primary-color-filled)">
                                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                </Text>
                            ) : (
                                <Text size="sm" c="dimmed">
                                    Nenhum arquivo selecionado
                                </Text>
                            )}

                            <FileButton
                                onChange={setFile}
                                accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
                            >
                                {(props) => (
                                    <Button {...props} variant="light" size="xs">
                                        {file ? "Alterar Arquivo" : "Selecionar Arquivo .xlsx"}
                                    </Button>
                                )}
                            </FileButton>
                        </Stack>
                    </Group>
                )}

                <Group justify="flex-end" mt="sm">
                    <Button variant="subtle" color="gray" onClick={handleCloseModal}>
                        {result ? "Fechar" : "Cancelar"}
                    </Button>
                    {!result && (
                        <Button
                            disabled={!file}
                            loading={importMutation.isPending}
                            onClick={handleImport}
                            leftSection={<Upload size={16} />}
                        >
                            Substituir Banco de Dados
                        </Button>
                    )}
                </Group>
            </Stack>
        </Modal>
    )
}
