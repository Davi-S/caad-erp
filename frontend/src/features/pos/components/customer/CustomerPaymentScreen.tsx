import { Alert, Badge, Box, Center, Loader, Paper, Stack, Text, Title } from "@mantine/core"
import { AlertTriangle, Banknote, Check, QrCode } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import { brl } from "@/helpers"
import type { PaymentDetails } from "../../types/broadcast"

interface CustomerPaymentScreenProps {
    total: number
    paymentDetails: PaymentDetails | null
    checkoutStatus: "idle" | "pending" | "success" | "error"
}

export function CustomerPaymentScreen({
    total,
    paymentDetails,
    checkoutStatus,
}: CustomerPaymentScreenProps) {
    const confirmed = checkoutStatus === "success"
    const method = paymentDetails?.method || "PIX"
    const isPix = paymentDetails?.method === "PIX"
    const pixQrBase64 = isPix ? paymentDetails.qrCodeBase64 || null : null
    const pixLoading = isPix ? paymentDetails.loading || false : false
    const pixError = isPix ? paymentDetails.error || null : null

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
                                {brl(total)}
                            </Text>

                            <Badge
                                variant="light"
                                color="gray"
                                size="sm"
                                leftSection={
                                    method === "PIX" ? <QrCode size={12} /> : <Banknote size={12} />
                                }
                            >
                                Forma de pagamento: {method === "PIX" ? "Pix" : "Dinheiro"}
                            </Badge>

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
                                                        Gerando QR Code PIX no Mercado Pago...
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
                                                    style={{ width: "100%", height: "100%" }}
                                                >
                                                    <Text size="xs" c="dimmed" fw={600} ta="center">
                                                        Escaneie o QR Code abaixo com seu banco:
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
                                                Entregue o valor em espécie para o atendente.
                                            </Text>
                                        </Stack>
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
