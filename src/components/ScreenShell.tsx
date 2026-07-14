export function ScreenShell({ children }) {
    return (
        <div
            className="relative w-full min-h-svh flex flex-col overflow-hidden bg-paper pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0px,env(safe-area-inset-left))] pr-[max(0px,env(safe-area-inset-right))]"
        >
            {children}
        </div>
    )
}
