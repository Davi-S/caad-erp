/**
 * Modal component allowing users to upload an Excel .xlsx workbook to replace the database.
 */

import { useState } from "react"
import { Alert, Button, FileButton, Group, Modal, Stack, Text, ThemeIcon } from "@mantine/core"
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { trpcClient } from "@/utils/trpc"

interface ImportWorkbookModalProps {
    opened: boolean
    onClose: () => void
}

export function ImportWorkbookModal({ opened, onClose }: ImportWorkbookModalProps) {
    const queryClient = useQueryClient()
    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successResult, setSuccessResult] = useState<{
        productsCount: number
        salesmenCount: number
        transactionsCount: number
    } | null>(null)

    const handleReset = () => {
        setFile(null)
        setError(null)
        setSuccessResult(null)
        setLoading(false)
    }

    const handleCloseModal = () => {
        handleReset()
        onClose()
    }

    const handleImport = async () => {
        if (!file) return
        setLoading(true)
        setError(null)
        setSuccessResult(null)

        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => {
                    const res = reader.result as string
                    resolve(res)
                }
                reader.onerror = () => reject(new Error("Erro ao ler o arquivo selecionado."))
                reader.readAsDataURL(file)
            })

            const res = await trpcClient.reports.importWorkbook.mutate({ base64 })
            setSuccessResult({
                productsCount: res.count?.productsCount ?? 0,
                salesmenCount: res.count?.salesmenCount ?? 0,
                transactionsCount: res.count?.transactionsCount ?? 0,
            })
            await queryClient.invalidateQueries()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erro ao importar planilha."
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            opened={opened}
            onClose={handleCloseModal}
            title={
                <Group gap="xs">
                    <ThemeIcon variant="light" color="blue" size="md">
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

                {error && (
                    <Alert
                        variant="light"
                        color="red"
                        title="Erro na importação"
                        icon={<AlertCircle size={18} />}
                    >
                        {error}
                    </Alert>
                )}

                {successResult && (
                    <Alert
                        variant="light"
                        color="green"
                        title="Importação concluída com sucesso!"
                        icon={<CheckCircle2 size={18} />}
                    >
                        <Stack gap={2} mt="xs">
                            <Text size="xs">
                                • <strong>{successResult.productsCount}</strong> produtos importados
                            </Text>
                            <Text size="xs">
                                • <strong>{successResult.salesmenCount}</strong> vendedores
                                importados
                            </Text>
                            <Text size="xs">
                                • <strong>{successResult.transactionsCount}</strong> transações
                                registradas
                            </Text>
                        </Stack>
                    </Alert>
                )}

                {!successResult && (
                    <Group
                        justify="center"
                        p="md"
                        style={{
                            border: "2px dashed var(--mantine-color-gray-3)",
                            borderRadius: "var(--mantine-radius-md)",
                        }}
                    >
                        <Stack align="center" gap="xs">
                            <FileSpreadsheet size={36} color="var(--mantine-color-gray-5)" />
                            {file ? (
                                <Text fw={600} size="sm" c="blue">
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
                        {successResult ? "Fechar" : "Cancelar"}
                    </Button>
                    {!successResult && (
                        <Button
                            color="blue"
                            disabled={!file}
                            loading={loading}
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
