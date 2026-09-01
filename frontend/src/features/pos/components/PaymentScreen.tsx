import { useState, useEffect, useCallback, useMemo } from "react"
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
    ThemeIcon,
} from "@mantine/core"
import {
    Check,
    ArrowLeft,
    AlertTriangle,
    QrCode,
    Banknote,
    RotateCw,
    CreditCard,
} from "lucide-react"
import { brl } from "@/helpers"
import { ScreenShell } from "@/components/ScreenShell"
import type { PaymentType } from "@/types"
import type { Salesman } from "@/types"
import { useCart } from "../hooks/useCart"
import { useCheckout } from "../hooks/useCheckout"
import { usePixPayment } from "../hooks/usePixPayment"

import type { PaymentDetails } from "../types/broadcast"

interface PaymentScreenProps {
    salesman: Salesman | null
    cartState: ReturnType<typeof useCart>
    checkoutState: ReturnType<typeof useCheckout>
    actions: {
        onConfirm: (method: PaymentType) => void
        onNewSale: () => void
        onEdit: () => void
        onCancel: () => void
    }
    onPaymentStateChange: (details: PaymentDetails) => void
}

const AUTO_NEW_SALE_TIMEOUT_MS = 60000

export function PaymentScreen({
    salesman,
    cartState,
    checkoutState,
    actions,
    onPaymentStateChange,
}: PaymentScreenProps) {
    const isZeroTotal = cartState.total === 0
    const totalSavings = cartState.totalItemDiscount + cartState.discount

    const [method, setMethod] = useState<PaymentType>(() => (isZeroTotal ? "Other" : "PIX"))

    const { status, error, resetCheckout } = checkoutState
    const { onConfirm, onNewSale, onEdit, onCancel } = actions

    const confirmed = status === "success"
    const confirming = status === "pending"
    const isLocked = status === "pending" || status === "success"

    useEffect(() => {
        if (isZeroTotal) {
            setMethod("Other")
        }
    }, [isZeroTotal])

    const methodOptions = useMemo(
        () => [
            {
                value: "PIX",
                label: <MethodLabel icon={<QrCode size={16} />} text="Pix" />,
                disabled: isLocked || isZeroTotal,
            },
            {
                value: "Cash",
                label: <MethodLabel icon={<Banknote size={16} />} text="Dinheiro" />,
                disabled: isLocked || isZeroTotal,
            },
            {
                value: "Other",
                label: <MethodLabel icon={<CreditCard size={16} />} text="Outro" />,
                disabled: isLocked,
            },
        ],
        [isLocked, isZeroTotal],
    )

    useEffect(() => {
        resetCheckout()
    }, [resetCheckout])

    useEffect(() => {
        if (!confirmed) return

        const timer = setTimeout(() => {
            onNewSale()
        }, AUTO_NEW_SALE_TIMEOUT_MS)

        return () => clearTimeout(timer)
    }, [confirmed, onNewSale])

    const handleApproved = useCallback(() => {
        if (!isLocked) {
            onConfirm("PIX")
        }
    }, [onConfirm, isLocked])

    const pixState = usePixPayment({
        amountInBrl: cartState.total / 100,
        salesmanName: salesman?.name ?? "",
        confirmed: isLocked,
        onPaymentApproved: handleApproved,
    })

    useEffect(() => {
        if (method === "PIX") {
            onPaymentStateChange({
                method: "PIX",
                qrCodeBase64: pixState.qrCodeBase64,
                loading: pixState.loading,
                error: pixState.error,
            })
        } else {
            onPaymentStateChange({
                method,
            })
        }
    }, [onPaymentStateChange, method, pixState.qrCodeBase64, pixState.loading, pixState.error])

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
                        Venda de {salesman?.name ?? ""}
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
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            flex: 1,
                            minHeight: 0,
                            borderColor: confirmed ? "var(--mantine-color-green-5)" : undefined,
                        }}
                    >
                        <Stack align="center" gap="xs" style={{ flex: 1, minHeight: 0 }}>
                            <Badge
                                color={confirmed ? "green" : "yellow"}
                                variant={confirmed ? "filled" : "light"}
                                radius="xl"
                                leftSection={confirmed ? <Check size={12} /> : undefined}
                            >
                                {confirmed ? "Pago" : "Aguardando pagamento"}
                            </Badge>

                            <Text
                                size="32px"
                                fw={700}
                                ff="monospace"
                                c={confirmed ? "green.7" : undefined}
                            >
                                {brl(cartState.total)}
                            </Text>

                            {totalSavings > 0 && (
                                <Badge variant="light" color="green" size="sm">
                                    Subtotal: {brl(cartState.subtotal)} • Economia: -
                                    {brl(totalSavings)}
                                </Badge>
                            )}

                            <SegmentedControl
                                data={methodOptions}
                                value={method}
                                onChange={(value) => setMethod(value as PaymentType)}
                                disabled={isLocked}
                                color="var(--mantine-primary-color-filled)"
                                mt="sm"
                                styles={{
                                    root: {
                                        display: "grid",
                                        gridTemplateColumns: `repeat(${methodOptions.length}, 1fr)`,
                                    },
                                }}
                            />

                            <Paper
                                withBorder
                                radius="md"
                                mt="sm"
                                w="100%"
                                style={{
                                    borderStyle: confirmed ? "solid" : "dashed",
                                    borderColor: confirmed
                                        ? "var(--mantine-color-green-3)"
                                        : undefined,
                                    backgroundColor: confirmed
                                        ? "var(--mantine-color-green-0)"
                                        : undefined,
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
                                    {confirmed ? (
                                        <Stack align="center" justify="center" gap="xs">
                                            <ThemeIcon
                                                color="green"
                                                variant="light"
                                                size={56}
                                                radius="xl"
                                            >
                                                <Check size={32} />
                                            </ThemeIcon>
                                            <Text fw={700} size="md" c="green.8">
                                                Pagamento recebido com sucesso!
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                Forma:{" "}
                                                {method === "PIX"
                                                    ? "Pix"
                                                    : method === "Cash"
                                                      ? "Dinheiro em espécie"
                                                      : "Outro"}
                                            </Text>
                                        </Stack>
                                    ) : (
                                        <>
                                            {method === "PIX" && (
                                                <Stack
                                                    align="center"
                                                    justify="center"
                                                    gap="xs"
                                                    style={{ width: "100%", height: "100%" }}
                                                >
                                                    {pixState.loading && (
                                                        <Stack align="center" gap="xs">
                                                            <Loader size="md" />
                                                            <Text size="sm" c="dimmed">
                                                                Gerando QR Code PIX no Mercado
                                                                Pago...
                                                            </Text>
                                                        </Stack>
                                                    )}

                                                    {!pixState.loading && pixState.error && (
                                                        <Alert
                                                            color="red"
                                                            icon={<AlertTriangle size={16} />}
                                                            title="Erro no Mercado Pago"
                                                        >
                                                            <Text size="xs" mb="xs">
                                                                {pixState.error}
                                                            </Text>
                                                            <Button
                                                                size="xs"
                                                                variant="light"
                                                                color="red"
                                                                leftSection={<RotateCw size={12} />}
                                                                onClick={pixState.retry}
                                                            >
                                                                Tentar novamente
                                                            </Button>
                                                        </Alert>
                                                    )}

                                                    {!pixState.loading &&
                                                        !pixState.error &&
                                                        pixState.qrCodeBase64 && (
                                                            <Stack
                                                                align="center"
                                                                gap="xs"
                                                                style={{
                                                                    height: "100%",
                                                                    justifyContent: "center",
                                                                }}
                                                            >
                                                                <Box
                                                                    style={{
                                                                        width: "100%",
                                                                        height: "100%",
                                                                        maxWidth: 240,
                                                                        maxHeight: 240,
                                                                        display: "flex",
                                                                        justifyContent: "center",
                                                                        alignItems: "center",
                                                                    }}
                                                                >
                                                                    <img
                                                                        src={`data:image/png;base64,${pixState.qrCodeBase64}`}
                                                                        alt="QR Code PIX Mercado Pago"
                                                                        style={{
                                                                            maxWidth: "100%",
                                                                            maxHeight: "100%",
                                                                            objectFit: "contain",
                                                                        }}
                                                                    />
                                                                </Box>
                                                            </Stack>
                                                        )}
                                                </Stack>
                                            )}

                                            {method === "Cash" && (
                                                <Stack align="center" justify="center" gap="xs">
                                                    <Banknote size={32} color="gray" />
                                                    <Text size="sm" c="dimmed" ta="center">
                                                        Receba o valor em espécie e confirme abaixo.
                                                    </Text>
                                                </Stack>
                                            )}

                                            {method === "Other" && (
                                                <Stack align="center" justify="center" gap="xs">
                                                    <CreditCard size={32} color="gray" />
                                                    <Text size="sm" c="dimmed" ta="center">
                                                        Receba o valor através de outro meio e
                                                        confirme abaixo.
                                                    </Text>
                                                </Stack>
                                            )}
                                        </>
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
                    <Stack gap="xs" w="100%">
                        <Button
                            size="lg"
                            onClick={() => onConfirm(method)}
                            loading={confirming}
                            disabled={isLocked}
                        >
                            {isZeroTotal ? "Confirmar sem cobrança" : "Já recebi o pagamento"}
                        </Button>
                        {method === "PIX" && !pixState.error && (
                            <Group justify="center" gap="xs">
                                <Loader size="xs" color="blue" />
                                <Text size="xs" c="dimmed" fw={500}>
                                    Aguardando confirmação automática do banco...
                                </Text>
                            </Group>
                        )}
                    </Stack>
                ) : (
                    <Button size="lg" color="green" onClick={onNewSale}>
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
