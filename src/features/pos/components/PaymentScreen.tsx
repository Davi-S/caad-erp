import { useState, useEffect } from "react"
import {
    ActionIcon, Alert, Badge, Button, Center,
    Group, Paper, ScrollArea, SegmentedControl,
    Stack, Text, Title
} from "@mantine/core"
import { Check, ArrowLeft, AlertTriangle, QrCode, Banknote, CreditCard, MoreHorizontal } from "lucide-react"
import { brl, buildQrGrid, QR_SIZE } from "@/helpers"
import { ScreenShell } from "@/components/ScreenShell"
import type { PaymentType } from "@/types"
import type { Salesman } from "@/types"
import { useCart } from "../hooks/useCart"
import { useCheckout } from "../hooks/useCheckout"

const QR_GRID = buildQrGrid()

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
    { value: "OnCredit", label: <MethodLabel icon={<CreditCard size={16} />} text="Fiado" /> },
    { value: "Other", label: <MethodLabel icon={<MoreHorizontal size={16} />} text="Outro" /> },
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
                    <Button onClick={onCancel} disabled={isLocked} variant="subtle" color="red" size="compact-sm">
                        Cancelar venda
                    </Button>
                </Group>
                <Stack gap={0} align="center">
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed" py="md" style={{ letterSpacing: 1 }}>
                        Recebendo pagamento
                    </Text>
                    <Title order={1} size="h5">
                        Venda de {salesman?.salesman_name}
                    </Title>
                </Stack>
            </Stack>

            {/* Middle Section */}
            <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }}>
                <Stack justify="center" style={{ minHeight: "100%" }} py="md">
                    <Paper withBorder shadow="sm" radius="md" p="lg" mx="auto" w="100%" maw={360}>
                        <Stack align="center" gap="xs">
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
                                    root: { display: "grid", gridTemplateColumns: `repeat(${METHOD_OPTIONS.length}, 1fr)` },
                                }}
                            />

                            <Paper withBorder radius="md" p="md" mt="sm" w="100%" mih={180} style={{ borderStyle: "dashed" }}>
                                <Center style={{ flexDirection: "column", height: "100%" }}>
                                    {method === "PIX" && (
                                        <Stack align="center" gap="sm" w="100%">
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: `repeat(${QR_SIZE}, 10px)`,
                                                    gridTemplateRows: `repeat(${QR_SIZE}, 10px)`,
                                                }}
                                            >
                                                {QR_GRID.flatMap((row, r) =>
                                                    row.map((cell, c) => (
                                                        <div
                                                            key={r + "-" + c}
                                                            style={{
                                                                width: 10,
                                                                height: 10,
                                                                backgroundColor: cell ? "var(--mantine-color-dark-9)" : "transparent",
                                                            }}
                                                        />
                                                    ))
                                                )}
                                            </div>
                                        </Stack>
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
                        <Alert color="red" icon={<AlertTriangle size={16} />} mx="auto" w="100%" maw={360}>
                            {error}
                        </Alert>
                    )}
                </Stack>
            </ScrollArea>

            {/* Footer */}
            <Stack mx="auto" w="100%" maw={360}>
                {!confirmed ? (
                    <Button
                        size="lg"
                        onClick={() => onConfirm(method)}
                        loading={confirming}
                    >
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
