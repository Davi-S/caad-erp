import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
    Button,
    Group,
    ScrollArea,
    Stack,
    Text,
    ThemeIcon,
    Title,
    UnstyledButton,
} from "@mantine/core"
import {
    ShoppingCart,
    Package,
    Tag,
    Users,
    ChevronRight,
    FileSpreadsheet,
    Monitor,
    ExternalLink,
    Upload,
} from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import { trpcClient } from "@/utils/trpc"
import { ImportWorkbookModal } from "./components/ImportWorkbookModal"

interface NavItem {
    to: string
    icon: typeof Package
    title: string
    description: string
}

// Everything except the POS, which gets its own distinct treatment below.
const MANAGEMENT_ITEMS: NavItem[] = [
    {
        to: "/stock",
        icon: Package,
        title: "Estoque",
        description: "Repor produtos e dar baixa",
    },
    {
        to: "/products",
        icon: Tag,
        title: "Produtos",
        description: "Cadastrar e editar o catálogo",
    },
    {
        to: "/salesmen",
        icon: Users,
        title: "Vendedores",
        description: "Gerenciar a equipe de vendas",
    },
]

export function HomePage() {
    const navigate = useNavigate()
    const [isDownloading, setIsDownloading] = useState(false)
    const [importModalOpened, setImportModalOpened] = useState(false)

    const handleDownloadWorkbook = async () => {
        setIsDownloading(true)
        try {
            const data = await trpcClient.reports.exportWorkbook.query()
            const binaryStr = window.atob(data.base64)
            const len = binaryStr.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i)
            }
            const blob = new Blob([bytes], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = data.filename || "caad_erp_workbook.xlsx"
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error("Failed to download workbook:", error)
        } finally {
            setIsDownloading(false)
        }
    }

    const handleOpenCustomerDisplay = () => {
        window.open("/customer", "_blank", "width=1280,height=800")
    }

    return (
        <ScreenShell>
            <ImportWorkbookModal
                opened={importModalOpened}
                onClose={() => setImportModalOpened(false)}
            />
            <ScrollArea
                style={{ flex: 1, minHeight: 0, width: "100%" }}
                type="auto"
                offsetScrollbars
            >
                <Stack gap="xl" py="lg" style={{ width: "100%" }}>
                    {/* Header */}
                    <Group justify="space-between" align="center">
                        <Stack gap={4}>
                            <Text
                                size="xs"
                                fw={600}
                                tt="uppercase"
                                c="dimmed"
                                style={{ letterSpacing: 1 }}
                            >
                                CAAD ERP
                            </Text>
                            <Title order={1} size="h2">
                                O que vamos fazer?
                            </Title>
                        </Stack>
                        <Group gap="xs">
                            <Button
                                variant="light"
                                size="xs"
                                leftSection={<Upload size={16} />}
                                onClick={() => setImportModalOpened(true)}
                            >
                                Importar Planilha
                            </Button>
                            <Button
                                variant="light"
                                size="xs"
                                leftSection={<FileSpreadsheet size={16} />}
                                loading={isDownloading}
                                onClick={handleDownloadWorkbook}
                            >
                                Baixar Planilha
                            </Button>
                        </Group>
                    </Group>

                    {/* POS: the primary operational tool, visually distinct from the rest */}
                    <UnstyledButton
                        onClick={() => navigate("/pos")}
                        p="lg"
                        style={{
                            borderRadius: "var(--mantine-radius-md)",
                            backgroundColor: "var(--mantine-primary-color-filled)",
                        }}
                    >
                        <Group justify="space-between" wrap="nowrap">
                            <Group wrap="nowrap">
                                <ThemeIcon
                                    variant="white"
                                    color="var(--mantine-primary-color-filled)"
                                    size={48}
                                    radius="xl"
                                >
                                    <ShoppingCart size={24} />
                                </ThemeIcon>
                                <Stack gap={0}>
                                    <Text fw={700} size="lg" c="white">
                                        Ponto de Venda
                                    </Text>
                                    <Text size="sm" c="white" style={{ opacity: 0.85 }}>
                                        Iniciar uma nova venda
                                    </Text>
                                </Stack>
                            </Group>
                            <ChevronRight color="white" />
                        </Group>
                    </UnstyledButton>

                    {/* Secondary management destinations */}
                    <Stack gap="xs">
                        <Text
                            size="xs"
                            fw={600}
                            tt="uppercase"
                            c="dimmed"
                            style={{ letterSpacing: 1 }}
                        >
                            Gerenciamento
                        </Text>
                        {MANAGEMENT_ITEMS.map((item) => (
                            <UnstyledButton
                                key={item.to}
                                onClick={() => navigate(item.to)}
                                p="sm"
                                style={{
                                    border: "1px solid var(--mantine-color-gray-3)",
                                    borderRadius: "var(--mantine-radius-md)",
                                }}
                            >
                                <Group justify="space-between" wrap="nowrap">
                                    <Group wrap="nowrap">
                                        <ThemeIcon
                                            variant="light"
                                            color="var(--mantine-primary-color-filled)"
                                            size={40}
                                            radius="xl"
                                        >
                                            <item.icon size={20} />
                                        </ThemeIcon>
                                        <Stack gap={0}>
                                            <Text fw={600}>{item.title}</Text>
                                            <Text size="xs" c="dimmed">
                                                {item.description}
                                            </Text>
                                        </Stack>
                                    </Group>
                                    <ChevronRight size={18} color="var(--mantine-color-gray-5)" />
                                </Group>
                            </UnstyledButton>
                        ))}
                    </Stack>

                    {/* Customer display launcher section */}
                    <Stack gap="xs">
                        <Text
                            size="xs"
                            fw={600}
                            tt="uppercase"
                            c="dimmed"
                            style={{ letterSpacing: 1 }}
                        >
                            Exibição Externa
                        </Text>
                        <UnstyledButton
                            onClick={handleOpenCustomerDisplay}
                            p="sm"
                            style={{
                                border: "1px solid var(--mantine-color-gray-3)",
                                borderRadius: "var(--mantine-radius-md)",
                            }}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <Group wrap="nowrap">
                                    <ThemeIcon variant="light" color="blue" size={40} radius="xl">
                                        <Monitor size={20} />
                                    </ThemeIcon>
                                    <Stack gap={0}>
                                        <Text fw={600}>Abrir Tela do Cliente</Text>
                                        <Text size="xs" c="dimmed">
                                            Abrir visualização do cliente em segundo monitor
                                        </Text>
                                    </Stack>
                                </Group>
                                <ExternalLink size={18} color="var(--mantine-color-gray-5)" />
                            </Group>
                        </UnstyledButton>
                    </Stack>
                </Stack>
            </ScrollArea>
        </ScreenShell>
    )
}
