import { Container } from '@mantine/core'

export function ScreenShell({ children }: { children: React.ReactNode }) {
    return (
        <Container
            px="xl"
            py="xl"
            h="100svh"
            bg="gray.0"
            display="flex"
            style={{
                flexDirection: 'column',
                overflow: 'hidden',
                paddingTop: 'max(var(--mantine-spacing-xl), env(safe-area-inset-top))',
                paddingBottom: 'max(var(--mantine-spacing-xl), env(safe-area-inset-bottom))',
            }}
        >
            {children}
        </Container>
    )
}
