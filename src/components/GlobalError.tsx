import { useRouteError, useNavigate } from "react-router-dom"
import { Button, Center, Stack, Text, ThemeIcon, Title } from "@mantine/core"
import { AlertTriangle } from "lucide-react"
import { ScreenShell } from "./ScreenShell"

export function GlobalError() {
    const error = useRouteError()
    const navigate = useNavigate()

    const errorMessage = error instanceof Error
        ? error.message
        : typeof error === "string"
            ? error
            : "Ocorreu um erro inesperado."

    return (
        <ScreenShell>
            <Center style={{ flex: 1 }}>
                <Stack align="center" gap="xs">
                    <ThemeIcon variant="light" color="red" size={48} radius="xl">
                        <AlertTriangle size={24} />
                    </ThemeIcon>

                    <Stack align="center" gap={4}>
                        <Title order={2} size="h4">Algo deu errado</Title>
                        <Text c="dimmed" ta="center" size="sm">
                            {errorMessage}
                        </Text>
                    </Stack>

                    <Button onClick={() => navigate(".", { replace: true })} mt="sm" size="lg">
                        Tentar de novo
                    </Button>
                </Stack>
            </Center>
        </ScreenShell>
    )
}
