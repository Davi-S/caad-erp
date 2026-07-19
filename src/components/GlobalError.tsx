import { useRouteError, useNavigate } from "react-router-dom"
import { StatusScreen } from "./StatusScreen"

export function GlobalError() {
    const error = useRouteError()
    const navigate = useNavigate()

    let errorMessage = "An unexpected error occurred"
    if (error instanceof Error) {
        errorMessage = error.message
    } else if (typeof error === "string") {
        errorMessage = error
    }

    return (
        <div className="w-full min-h-svh font-body bg-paper bg-[radial-gradient(circle,var(--color-paperLine)_1px,transparent_1px)] bg-size[18px_18px]">
            <StatusScreen
                mode="error"
                message={errorMessage}
                onRetry={() => navigate(".", { replace: true })}
            />
        </div>
    )
}
