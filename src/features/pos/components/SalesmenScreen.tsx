import {
    Button, Center, Group,
    Radio, ScrollArea, Stack, Text, ThemeIcon, Title
} from "@mantine/core"
import { useState } from "react"
import { Users } from "lucide-react"
import { ScreenShell } from "@/components/ScreenShell"
import type { Salesmen } from "@/types"

interface SalesmenScreenProps {
    salesmen: Salesmen
    onNext: (salesmanId: string) => void
}

export function SalesmenScreen({
    salesmen,
    onNext
}: SalesmenScreenProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    return (
        <ScreenShell>
            {/* Header */}
            <Stack gap={4}>
                <Title order={1} size="h2">
                    Quem tá vendendo hoje?
                </Title>
            </Stack>

            {/* Middle Section */}
            <Stack style={{ flex: 1, minHeight: 0 }} py="lg">
                {salesmen.length === 0 ? (
                    <Center style={{ flex: 1 }}>
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="light" color="gray" size={48} radius="xl">
                                <Users size={22} />
                            </ThemeIcon>
                            <Text c="dimmed" ta="center">
                                Nenhum vendedor cadastrado ainda.
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <ScrollArea type="scroll" style={{ flex: 1 }}>
                        <Radio.Group value={selectedId ?? ""} onChange={(id) => setSelectedId(id)}>
                            <Stack gap="sm">
                                {salesmen.map((salesman) => (
                                    <Radio.Card
                                        key={salesman.salesman_id}
                                        value={salesman.salesman_id}
                                        radius="md"
                                        p="sm"
                                    >
                                        <Group wrap="nowrap">
                                            <Radio.Indicator />
                                            <Text fw={600}>{salesman.salesman_name}</Text>
                                        </Group>
                                    </Radio.Card>
                                ))}
                            </Stack>
                        </Radio.Group>
                    </ScrollArea>
                )}
            </Stack>

            {/* Footer */}
            <Button
                disabled={!selectedId}
                onClick={() => selectedId && onNext(selectedId)}
                size="lg"
            >
                Começar venda
            </Button>
        </ScreenShell>
    )
}
