import { useState, useEffect, useCallback, useRef } from "react"
import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Center,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
    Box,
    Loader,
} from "@mantine/core"
import {
    Check,
    ArrowLeft,
    AlertTriangle,
    QrCode,
    Banknote,
    Copy,
    RotateCw,
} from "lucide-react"
import { brl } from "@/helpers"
import { ScreenShell } from "@/components/ScreenShell"
import type { PaymentType } from "@/types"
import type { Salesman } from "@/types"
import { useCart } from "../hooks/useCart"
import { useCheckout } from "../hooks/useCheckout"
import { createPixPayment, checkPaymentStatus } from "@/api/mercadoPago"

interface PaymentScreenProps {
    salesman: Salesman
    cartState: ReturnType<typeof useCart>
    checkoutState: ReturnType<typeof useCheckout>
    actions: {
        onConfirm: (method: PaymentType) => void
        onNewSale: () => void
        onEdit: () => void
        onCancel: () => void
    }
}

const METHOD_OPTIONS = [
    { value: "PIX", label: <MethodLabel icon={<QrCode size={16} />} text="Pix" /> },
    { value: "Cash", label: <MethodLabel icon={<Banknote size={16} />} text="Dinheiro" /> },
]

export function PaymentScreen({ salesman, cartState, checkoutState, actions }: PaymentScreenProps) {
    const [method, setMethod] = useState<PaymentType>("PIX")
    const [pixPaymentId, setPixPaymentId] = useState<number | string | null>(null)
    const [pixQrCode, setPixQrCode] = useState<string | null>(null)
    const [pixQrCodeBase64, setPixQrCodeBase64] = useState<string | null>(null)
    const [pixLoading, setPixLoading] = useState(false)
    const [pixError, setPixError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const { status, error, resetCheckout } = checkoutState
    const { onConfirm, onNewSale, onEdit, onCancel } = actions

    const confirmed = status === "success"
    const confirming = status === "pending"
    const isLocked = status === "pending" || status === "success"

    const hasAutoConfirmed = useRef(false)

    useEffect(() => {
        resetCheckout()
        hasAutoConfirmed.current = false
    }, [resetCheckout])

    const handleCreatePix = useCallback(async () => {
        if (cartState.total <= 0) return
        setPixLoading(true)
        setPixError(null)
        try {
            const data = await createPixPayment(
                cartState.total / 100,
                `Venda - ${salesman.salesman_name}`
            )
            setPixPaymentId(data.id)
            setPixQrCode(data.qr_code || null)
            setPixQrCodeBase64(data.qr_code_base64)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erro ao gerar PIX com Mercado Pago."
            setPixError(msg)
        } finally {
            setPixLoading(false)
        }
    }, [cartState.total, salesman.salesman_name])

    useEffect(() => {
        if (!confirmed) {
            handleCreatePix()
        }
    }, [handleCreatePix, confirmed])

    // Poll payment status via Mercado Pago API with fail-fast error propagation
    useEffect(() => {
        if (!pixPaymentId || confirmed || hasAutoConfirmed.current) return

        const intervalId = setInterval(async () => {
            try {
                const statusRes = await checkPaymentStatus(pixPaymentId)
                if (statusRes.status === "approved" && !hasAutoConfirmed.current) {
                    hasAutoConfirmed.current = true
                    clearInterval(intervalId)
                    onConfirm("PIX")
                }
            } catch (err: unknown) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : "Erro ao verificar status do pagamento PIX no Mercado Pago."
                setPixError(msg)
                clearInterval(intervalId)
            }
        }, 3000)

        return () => clearInterval(intervalId)
    }, [pixPaymentId, confirmed, onConfirm])

    const handleCopyPix = () => {
        if (pixQrCode) {
            navigator.clipboard.writeText(pixQrCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <ScreenShell>
            {/* Header */}
            <Stack gap={4}>
                <Group justify="space-between">
                    <ActionIcon onClick={onEdit} disabled={isLocked} variant="subtle" size="lg">
                        <ArrowLeft />
                    </ActionIcon>
                    <Button
                        onClick={onCancel}
                        disabled={isLocked}
                        variant="subtle"
                        color="red"
                        size="compact-sm"
                    >
                        Cancelar venda
                    </Button>
                </Group>
                <Stack gap={0} align="center">
                    <Text
                        size="xs"
                        fw={600}
                        tt="uppercase"
                        c="dimmed"
                        py="md"
                        style={{ letterSpacing: 1 }}
                    >
                        Recebendo pagamento
                    </Text>
                    <Title order={1} size="h5">
                        Venda de {salesman.salesman_name}
                    </Title>
                </Stack>
            </Stack>

            {/* Middle Section */}
            <Box
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                }}
                py="sm"
            >
                <Stack
                    align="stretch"
                    justify="center"
                    style={{ flex: 1, minHeight: 0 }}
                    mx="auto"
                    w="100%"
                >
                    <Paper
                        withBorder
                        shadow="sm"
                        radius="md"
                        p="lg"
                        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
                    >
                        <Stack align="center" gap="xs" style={{ flex: 1, minHeight: 0 }}>
                            <Badge
                                color={confirmed ? "var(--mantine-primary-color-filled)" : "yellow"}
                                variant={confirmed ? "filled" : "light"}
                                radius="xl"
                                leftSection={confirmed ? <Check size={12} /> : undefined}
                            >
                                {confirmed ? "Pago" : "Aguardando pagamento"}
                            </Badge>

                            <Text size="32px" fw={700} ff="monospace">
                                {brl(cartState.total)}
                            </Text>

                            <SegmentedControl
                                data={METHOD_OPTIONS}
                                value={method}
                                onChange={(value) => setMethod(value as PaymentType)}
                                disabled={isLocked}
                                color="var(--mantine-primary-color-filled)"
                                mt="sm"
                                styles={{
                                    root: {
                                        display: "grid",
                                        gridTemplateColumns: `repeat(${METHOD_OPTIONS.length}, 1fr)`,
                                    },
                                }}
                            />

                            <Paper
                                withBorder
                                radius="md"
                                mt="sm"
                                w="100%"
                                style={{
                                    borderStyle: "dashed",
                                    flex: 1,
                                    minHeight: 0,
                                    position: "relative",
                                }}
                            >
                                <Center
                                    style={{
                                        position: "absolute",
                                        top: 16,
                                        bottom: 16,
                                        left: 16,
                                        right: 16,
                                    }}
                                >
                                    {method === "PIX" && (
                                        <Stack align="center" justify="center" gap="xs" style={{ width: "100%", height: "100%" }}>
                                            {pixLoading && (
                                                <Stack align="center" gap="xs">
                                                    <Loader size="md" />
                                                    <Text size="sm" c="dimmed">
                                                        Gerando QR Code PIX no Mercado Pago...
                                                    </Text>
                                                </Stack>
                                            )}

                                            {!pixLoading && pixError && (
                                                <Alert color="red" icon={<AlertTriangle size={16} />} title="Erro no Mercado Pago">
                                                    <Text size="xs" mb="xs">
                                                        {pixError}
                                                    </Text>
                                                    <Button
                                                        size="xs"
                                                        variant="light"
                                                        color="red"
                                                        leftSection={<RotateCw size={12} />}
                                                        onClick={handleCreatePix}
                                                    >
                                                        Tentar novamente
                                                    </Button>
                                                </Alert>
                                            )}

                                            {!pixLoading && !pixError && pixQrCodeBase64 && (
                                                <Stack align="center" gap="xs" style={{ height: "100%", justifyContent: "center" }}>
                                                    <Box
                                                        style={{
                                                            maxWidth: 180,
                                                            maxHeight: 180,
                                                            display: "flex",
                                                            justifyContent: "center",
                                                            alignItems: "center",
                                                        }}
                                                    >
                                                        <img
                                                            src={`data:image/png;base64,${pixQrCodeBase64}`}
                                                            alt="QR Code PIX Mercado Pago"
                                                            style={{
                                                                maxWidth: "100%",
                                                                maxHeight: "100%",
                                                                objectFit: "contain",
                                                            }}
                                                        />
                                                    </Box>
                                                    <Group gap="xs">
                                                        <Loader size="xs" color="blue" />
                                                        <Text size="xs" c="dimmed" fw={500}>
                                                            Aguardando confirmação do banco...
                                                        </Text>
                                                    </Group>
                                                    {pixQrCode && (
                                                        <Button
                                                            variant="subtle"
                                                            size="xs"
                                                            leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
                                                            onClick={handleCopyPix}
                                                        >
                                                            {copied ? "Copiado!" : "Copiar PIX Copia e Cola"}
                                                        </Button>
                                                    )}
                                                </Stack>
                                            )}
                                        </Stack>
                                    )}

                                    {method === "Cash" && (
                                        <Text size="sm" c="dimmed" ta="center">
                                            Receba o valor em espécie e confirme abaixo.
                                        </Text>
                                    )}
                                </Center>
                            </Paper>
                        </Stack>
                    </Paper>

                    {error && (
                        <Alert color="red" icon={<AlertTriangle size={16} />} w="100%" mt="sm">
                            {error}
                        </Alert>
                    )}
                </Stack>
            </Box>

            {/* Footer */}
            <Stack mx="auto" w="100%">
                {!confirmed ? (
                    method === "Cash" ? (
                        <Button size="lg" onClick={() => onConfirm(method)} loading={confirming}>
                            Já recebi o pagamento
                        </Button>
                    ) : (
                        <Group justify="center" p="xs">
                            <Loader size="sm" color="blue" />
                            <Text size="sm" c="dimmed" fw={500}>
                                Aguardando confirmação do banco...
                            </Text>
                        </Group>
                    )
                ) : (
                    <Button size="lg" onClick={onNewSale}>
                        Nova venda
                    </Button>
                )}
            </Stack>
        </ScreenShell>
    )
}

function MethodLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <Stack gap={2} align="center" py={4}>
            {icon}
            <Text size="10px" fw={600} tt="uppercase">
                {text}
            </Text>
        </Stack>
    )
}
