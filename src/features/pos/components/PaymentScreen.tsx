import { useState, useEffect } from "react"
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
} from "@mantine/core"
import { PixCanvas } from "react-qrcode-pix"
import {
    Check,
    ArrowLeft,
    AlertTriangle,
    QrCode,
    Banknote,
    CreditCard,
    MoreHorizontal,
} from "lucide-react"
import { brl } from "@/helpers"
import { ScreenShell } from "@/components/ScreenShell"
import type { PaymentType } from "@/types"
import type { Salesman } from "@/types"
import { useCart } from "../hooks/useCart"
import { useCheckout } from "../hooks/useCheckout"

// TODO: Move these to env variables or a config file
// These describe the receiver of the payment, not the salesman or customer.
const PIX_MERCHANT = {
    pixkey: "+5538988170470", // CPF, CNPJ, email, phone, or random key
    merchant: "Davi Alves Sampaio", // max 25 chars, no accents (BACEN spec)
    city: "CURITIBA", // max 15 chars, no accents
}

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
    // do not sell on credit yet, for it may require move complexity on the
    // debt payment and salesman debt maters. Same for "other" payments. Keep it
    // simple for now
    // { value: "OnCredit", label: <MethodLabel icon={<CreditCard size={16} />} text="Fiado" /> },
    // { value: "Other", label: <MethodLabel icon={<MoreHorizontal size={16} />} text="Outro" /> },
]

export function PaymentScreen({ salesman, cartState, checkoutState, actions }: PaymentScreenProps) {
    const [method, setMethod] = useState<PaymentType>("PIX")

    const { status, error, resetCheckout } = checkoutState
    const { onConfirm, onNewSale, onEdit, onCancel } = actions

    useEffect(() => {
        resetCheckout()
    }, [])

    const confirmed = status === "success"
    const confirming = status === "pending"
    const isLocked = status === "pending" || status === "success"

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
                        Venda de {salesman?.salesman_name}
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

                            {/* Detached absolute container to perfectly scale the canvas top-down */}
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
                                        <PixCanvas
                                            pixkey={PIX_MERCHANT.pixkey}
                                            merchant={PIX_MERCHANT.merchant}
                                            city={PIX_MERCHANT.city}
                                            amount={cartState.total / 100}
                                            internalProps={{
                                                style: {
                                                    width: "100%",
                                                    height: "100%",
                                                    objectFit: "contain",
                                                },
                                            }}
                                        />
                                    )}

                                    {method === "Cash" && (
                                        <Text size="sm" c="dimmed" ta="center">
                                            Receba o valor em espécie e confirme abaixo.
                                        </Text>
                                    )}

                                    {method === "OnCredit" && (
                                        <Text size="sm" c="dimmed" ta="center">
                                            O valor será adicionado à conta do cliente.
                                        </Text>
                                    )}

                                    {method === "Other" && (
                                        <Text size="sm" c="dimmed" ta="center">
                                            Utilize a maquininha de cartão ou outro método externo.
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
                    <Button size="lg" onClick={() => onConfirm(method)} loading={confirming}>
                        Já recebi o pagamento
                    </Button>
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
