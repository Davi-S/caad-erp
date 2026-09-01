import {
    Alert,
    Badge,
    Box,
    Center,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from "@mantine/core"
import { AlertTriangle, Banknote, Check, QrCode, CreditCard } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import { brl } from "@/helpers"
import type { PaymentDetails } from "../../types/broadcast"

interface CustomerPaymentScreenProps {
    total: number
    subtotal?: number
    discount?: number
    paymentDetails: PaymentDetails | null
    checkoutStatus: "idle" | "pending" | "success" | "error"
}

export function CustomerPaymentScreen({
    total,
    subtotal,
    discount,
    paymentDetails,
    checkoutStatus,
}: CustomerPaymentScreenProps) {
    const confirmed = checkoutStatus === "success"
    const method = paymentDetails?.method || "PIX"
    const pixDetails = paymentDetails?.method === "PIX" ? paymentDetails : null
    const pixQrBase64 = pixDetails?.qrCodeBase64 ?? null
    const pixLoading = pixDetails?.loading ?? false
    const pixError = pixDetails?.error ?? null

    return (
        <ScreenShell>
            {/* Header */}
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
                    Pagamento
                </Title>
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
                                {brl(total)}
                            </Text>

                            {discount && discount > 0 ? (
                                <Badge variant="light" color="green" size="sm">
                                    Subtotal: {brl(subtotal ?? total + discount)} • Economia:{" "}
                                    {brl(discount)}
                                </Badge>
                            ) : null}

                            <Badge
                                variant="light"
                                color={confirmed ? "green" : "gray"}
                                size="sm"
                                leftSection={
                                    method === "PIX" ? (
                                        <QrCode size={12} />
                                    ) : method === "Cash" ? (
                                        <Banknote size={12} />
                                    ) : (
                                        <CreditCard size={12} />
                                    )
                                }
                            >
                                Forma de pagamento:{" "}
                                {method === "PIX"
                                    ? "Pix"
                                    : method === "Cash"
                                      ? "Dinheiro"
                                      : "Outro"}
                            </Badge>

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
                                                size={60}
                                                radius="xl"
                                            >
                                                <Check size={36} />
                                            </ThemeIcon>
                                            <Text fw={700} size="lg" c="green.8">
                                                Pagamento Aprovado!
                                            </Text>
                                            <Text size="sm" c="dimmed">
                                                Muito obrigado pela preferência.
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
                                                    {pixLoading && (
                                                        <Stack align="center" gap="xs">
                                                            <Loader size="md" />
                                                            <Text size="sm" c="dimmed">
                                                                Gerando QR Code PIX no Mercado
                                                                Pago...
                                                            </Text>
                                                        </Stack>
                                                    )}

                                                    {!pixLoading && pixError && (
                                                        <Alert
                                                            color="red"
                                                            icon={<AlertTriangle size={16} />}
                                                            title="Erro no Mercado Pago"
                                                        >
                                                            <Text size="xs">{pixError}</Text>
                                                        </Alert>
                                                    )}

                                                    {!pixLoading && !pixError && pixQrBase64 && (
                                                        <Stack
                                                            align="center"
                                                            justify="center"
                                                            gap="xs"
                                                            style={{
                                                                width: "100%",
                                                                height: "100%",
                                                            }}
                                                        >
                                                            <Text
                                                                size="xs"
                                                                c="dimmed"
                                                                fw={600}
                                                                ta="center"
                                                            >
                                                                Escaneie o QR Code abaixo com seu
                                                                banco:
                                                            </Text>
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
                                                                    src={`data:image/png;base64,${pixQrBase64}`}
                                                                    alt="QR Code Pix"
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
                                                        Entregue o valor em espécie para o
                                                        atendente.
                                                    </Text>
                                                </Stack>
                                            )}

                                            {method === "Other" && (
                                                <Stack align="center" justify="center" gap="xs">
                                                    <CreditCard size={32} color="gray" />
                                                    <Text size="sm" c="dimmed" ta="center">
                                                        Aguarde a confirmação do atendente.
                                                    </Text>
                                                </Stack>
                                            )}
                                        </>
                                    )}
                                </Center>
                            </Paper>
                        </Stack>
                    </Paper>
                </Stack>
            </Box>
        </ScreenShell>
    )
}
