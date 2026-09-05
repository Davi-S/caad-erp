import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    FileButton,
    Group,
    NumberInput,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core"
import { ArrowLeft, Check, Download, RotateCcw, Upload, AlertTriangle } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import {
    useAppConfig,
    DEFAULT_CONFIG,
    exportConfigAsJson,
    parseConfigFile,
    type AppConfig,
} from "@/config"
import { trpc } from "@/utils/trpc"

export function SettingsPage() {
    const navigate = useNavigate()
    const { config, updateConfig, overwriteConfig, resetConfig } = useAppConfig()

    // Form draft state
    const [timeoutSeconds, setTimeoutSeconds] = useState<number>(
        Math.round(config.autoStartNewSaleTimeoutMs / 1000),
    )
    const [delimiter, setDelimiter] = useState<string>(config.productGroupingDelimiter)
    const [pixTemplate, setPixTemplate] = useState<string>(config.pixDescriptionTemplate)
    const [excelFilename, setExcelFilename] = useState<string>(config.excelDefaultFilename)

    // Notification states
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // Backend Config
    const utils = trpc.useUtils()
    const { data: backendConfig } = trpc.settings.getBackendConfig.useQuery()
    const updateBackendConfig = trpc.settings.updateBackendConfig.useMutation({
        onSuccess: () => {
            utils.settings.getBackendConfig.invalidate()
        },
    })

    const [backendToken, setBackendToken] = useState<string>("")
    const [backendEmail, setBackendEmail] = useState<string>("")

    useEffect(() => {
        if (backendConfig) {
            setBackendToken(backendConfig.mercadoPagoAccessToken || "")
            setBackendEmail(backendConfig.mercadoPagoPayerEmail || "")
        }
    }, [backendConfig])

    // Sync draft when config changes
    useEffect(() => {
        setTimeoutSeconds(Math.round(config.autoStartNewSaleTimeoutMs / 1000))
        setDelimiter(config.productGroupingDelimiter)
        setPixTemplate(config.pixDescriptionTemplate)
        setExcelFilename(config.excelDefaultFilename)
    }, [config])

    const handleSave = async () => {
        setErrorMessage(null)
        const newTimeoutMs = Math.max(0, Math.floor((timeoutSeconds || 0) * 1000))
        const cleanDelimiter = delimiter
        const cleanPixTemplate = pixTemplate.trim() || DEFAULT_CONFIG.pixDescriptionTemplate
        const cleanExcelFilename = excelFilename.trim() || DEFAULT_CONFIG.excelDefaultFilename

        updateConfig({
            autoStartNewSaleTimeoutMs: newTimeoutMs,
            productGroupingDelimiter: cleanDelimiter,
            pixDescriptionTemplate: cleanPixTemplate,
            excelDefaultFilename: cleanExcelFilename,
        })

        try {
            await updateBackendConfig.mutateAsync({
                mercadoPagoAccessToken: backendToken || undefined,
                mercadoPagoPayerEmail: backendEmail || "cliente@caad.com.br",
            })
            setSuccessMessage("Configurações salvas com sucesso!")
        } catch (err: any) {
            setErrorMessage(err.message || "Erro ao salvar configurações do servidor.")
        }

        setTimeout(() => setSuccessMessage(null), 4000)
    }

    const handleResetDefaults = () => {
        setErrorMessage(null)
        resetConfig()
        setTimeoutSeconds(Math.round(DEFAULT_CONFIG.autoStartNewSaleTimeoutMs / 1000))
        setDelimiter(DEFAULT_CONFIG.productGroupingDelimiter)
        setPixTemplate(DEFAULT_CONFIG.pixDescriptionTemplate)
        setExcelFilename(DEFAULT_CONFIG.excelDefaultFilename)
        setSuccessMessage("Configurações restauradas para os padrões originais.")
        setTimeout(() => setSuccessMessage(null), 4000)
    }

    const handleExport = () => {
        const currentDraft: AppConfig = {
            autoStartNewSaleTimeoutMs: Math.max(0, Math.floor((timeoutSeconds || 0) * 1000)),
            productGroupingDelimiter: delimiter,
            pixDescriptionTemplate: pixTemplate.trim() || DEFAULT_CONFIG.pixDescriptionTemplate,
            excelDefaultFilename: excelFilename.trim() || DEFAULT_CONFIG.excelDefaultFilename,
        }
        exportConfigAsJson(currentDraft)
    }

    const handleImportFile = async (file: File | null) => {
        if (!file) return
        setErrorMessage(null)
        try {
            const importedConfig = await parseConfigFile(file)
            overwriteConfig(importedConfig)
            setSuccessMessage("Arquivo de configuração importado e aplicado com sucesso!")
            setTimeout(() => setSuccessMessage(null), 4000)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Falha ao importar arquivo."
            setErrorMessage(msg)
        }
    }

    return (
        <ScreenShell>
            {/* Header */}
            <Group wrap="nowrap" justify="space-between" align="center" mb="md">
                <Group wrap="nowrap">
                    <ActionIcon
                        onClick={() => navigate("/")}
                        variant="subtle"
                        size="lg"
                        aria-label="Voltar para a página inicial"
                    >
                        <ArrowLeft />
                    </ActionIcon>
                    <Stack gap={0}>
                        <Text
                            size="xs"
                            fw={600}
                            tt="uppercase"
                            c="dimmed"
                            style={{ letterSpacing: 1 }}
                        >
                            Configurações
                        </Text>
                        <Title order={1} size="h5">
                            Preferências do Sistema
                        </Title>
                    </Stack>
                </Group>
            </Group>

            {/* Scrollable Content */}
            <ScrollArea
                style={{ flex: 1, minHeight: 0, width: "100%" }}
                type="auto"
                offsetScrollbars
            >
                <Stack gap="md" pb="xl">
                    {successMessage && (
                        <Alert
                            color="green"
                            icon={<Check size={16} />}
                            title="Sucesso"
                            withCloseButton
                            onClose={() => setSuccessMessage(null)}
                        >
                            <Text size="xs">{successMessage}</Text>
                        </Alert>
                    )}

                    {errorMessage && (
                        <Alert
                            color="red"
                            icon={<AlertTriangle size={16} />}
                            title="Erro"
                            withCloseButton
                            onClose={() => setErrorMessage(null)}
                        >
                            <Text size="xs">{errorMessage}</Text>
                        </Alert>
                    )}

                    {/* Section 1: POS & Operations */}
                    <Card
                        radius="md"
                        p="md"
                        style={{
                            border: "1px solid var(--mantine-color-default-border)",
                            backgroundColor: "transparent",
                        }}
                    >
                        <Stack gap="sm">
                            <Text fw={600} size="sm">
                                Ponto de Venda
                            </Text>

                            <NumberInput
                                label="Tempo para Nova Venda Automática"
                                description="Tempo em segundos para reiniciar a tela após a venda (0 desativa o reinício automático)."
                                value={timeoutSeconds}
                                onChange={(val) =>
                                    setTimeoutSeconds(typeof val === "number" ? val : 0)
                                }
                                min={0}
                                step={5}
                                suffix=" s"
                            />

                            <TextInput
                                label="Separador de Variações de Produto"
                                description="Texto usado no nome do produto para agrupar variações em um único card (ex: 'Camisa - M')."
                                value={delimiter}
                                onChange={(e) => setDelimiter(e.currentTarget.value)}
                                placeholder=" - "
                            />
                        </Stack>
                    </Card>

                    {/* Section 2: Payments / PIX */}
                    <Card
                        radius="md"
                        p="md"
                        style={{
                            border: "1px solid var(--mantine-color-default-border)",
                            backgroundColor: "transparent",
                        }}
                    >
                        <Stack gap="sm">
                            <Text fw={600} size="sm">
                                Integração de Pagamentos (PIX / Mercado Pago)
                            </Text>

                            <TextInput
                                label="Mercado Pago Access Token"
                                description="O token de acesso para a integração PIX. (Requer reinicialização do backend se o servidor já estiver rodando)"
                                value={backendToken}
                                onChange={(e) => setBackendToken(e.currentTarget.value)}
                                placeholder="APP_USR-..."
                                type="password"
                            />

                            <TextInput
                                label="Email do Pagador (Padrão)"
                                description="O email usado como padrão na criação do QR Code PIX."
                                value={backendEmail}
                                onChange={(e) => setBackendEmail(e.currentTarget.value)}
                                placeholder="cliente@caad.com.br"
                            />

                            <TextInput
                                label="Modelo de Descrição do PIX"
                                description="Texto enviado ao Mercado Pago na cobrança PIX. Suporta a variável {salesmanName}."
                                value={pixTemplate}
                                onChange={(e) => setPixTemplate(e.currentTarget.value)}
                                placeholder="Venda - {salesmanName}"
                            />

                            <Group gap="sm">
                                <Text size="xs" c="dimmed">
                                    Variável disponível:
                                </Text>
                                <Badge
                                    size="xs"
                                    variant="outline"
                                    style={{ cursor: "pointer" }}
                                    onClick={() => {
                                        if (!pixTemplate.includes("{salesmanName}")) {
                                            setPixTemplate((prev) =>
                                                `${prev} {salesmanName}`.trim(),
                                            )
                                        }
                                    }}
                                >
                                    {"{salesmanName}"}
                                </Badge>
                            </Group>
                        </Stack>
                    </Card>

                    {/* Section 3: Reports & Excel */}
                    <Card
                        radius="md"
                        p="md"
                        style={{
                            border: "1px solid var(--mantine-color-default-border)",
                            backgroundColor: "transparent",
                        }}
                    >
                        <Stack gap="sm">
                            <Text fw={600} size="sm">
                                Relatórios e Planilhas
                            </Text>

                            <TextInput
                                label="Nome Padrão do Arquivo Excel"
                                description="Nome de arquivo sugerido ao baixar a planilha executiva com os dados do sistema."
                                value={excelFilename}
                                onChange={(e) => setExcelFilename(e.currentTarget.value)}
                                placeholder="caad_erp_workbook.xlsx"
                            />
                        </Stack>
                    </Card>

                    {/* Section 4: Backup & Migration */}
                    <Card
                        radius="md"
                        p="md"
                        style={{
                            border: "1px solid var(--mantine-color-default-border)",
                            backgroundColor: "transparent",
                        }}
                    >
                        <Stack gap="sm">
                            <Text fw={600} size="sm">
                                Backup e Migração de Configurações
                            </Text>

                            <Text size="xs" c="dimmed">
                                Exporte um arquivo .json para compartilhar as mesmas configurações
                                com outro caixa ou computador, ou importe um arquivo existente.
                            </Text>

                            <Group gap="xs" wrap="wrap">
                                <Button
                                    variant="light"
                                    size="xs"
                                    leftSection={<Download size={14} />}
                                    onClick={handleExport}
                                >
                                    Exportar Arquivo (.json)
                                </Button>

                                <FileButton
                                    onChange={handleImportFile}
                                    accept="application/json,.json"
                                >
                                    {(props) => (
                                        <Button
                                            {...props}
                                            variant="light"
                                            size="xs"
                                            leftSection={<Upload size={14} />}
                                        >
                                            Importar Arquivo (.json)
                                        </Button>
                                    )}
                                </FileButton>

                                <Button
                                    variant="light"
                                    color="red"
                                    size="xs"
                                    leftSection={<RotateCcw size={14} />}
                                    onClick={handleResetDefaults}
                                >
                                    Restaurar Padrões
                                </Button>
                            </Group>
                        </Stack>
                    </Card>

                    {/* Bottom Actions */}
                    <Group justify="flex-end" gap="xs" mt="xs">
                        <Button variant="default" size="sm" onClick={() => navigate("/")}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleSave}>
                            Salvar Alterações
                        </Button>
                    </Group>
                </Stack>
            </ScrollArea>
        </ScreenShell>
    )
}
