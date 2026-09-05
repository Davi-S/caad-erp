import { Container, useMantineColorScheme } from "@mantine/core"
import { useHotkeys } from "@mantine/hooks"

export function ScreenShell({ children }: { children: React.ReactNode }) {
    const { toggleColorScheme } = useMantineColorScheme()

    useHotkeys([["a", () => toggleColorScheme()]])

    return (
        <Container
            px="xl"
            py="xl"
            h="100svh"
            display="flex"
            style={{
                flexDirection: "column",
                overflow: "hidden",
                paddingTop: "max(var(--mantine-spacing-xl), env(safe-area-inset-top))",
                paddingBottom: "max(var(--mantine-spacing-xl), env(safe-area-inset-bottom))",
            }}
        >
            {children}
        </Container>
    )
}
