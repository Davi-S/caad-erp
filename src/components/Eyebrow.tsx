export function Eyebrow({ step, label }) {
    return (
        <div className="flex items-center gap-2 mb-1">
            <span
                className="text-xs px-1.5 py-0.5 rounded font-mono font-semibold bg-tealSoft text-tealDark"
            >
                {step}/3
            </span>
            <span
                className="text-xs uppercase tracking-[0.12em] font-body font-semibold text-inkFaint "
            >
                {label}
            </span>
        </div>
    )
}
