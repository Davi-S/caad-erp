import { TextInput } from "@mantine/core"
import type { TextInputProps } from "@mantine/core"
import { brl } from "@/helpers"

interface CurrencyInputProps extends Omit<TextInputProps, "value" | "onChange"> {
    value?: number // in integer cents
    onChange?: (value: number) => void // emits integer cents
}

export function CurrencyInput({ value, onChange, onFocus, ...props }: CurrencyInputProps) {
    // Format the incoming integer cents (e.g., 123) to a BRL string (R$ 1,23)
    const displayValue = typeof value === "number" ? brl(value) : ""

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Extract only digits, handling raw keystrokes as cents directly
        const rawValue = e.target.value.replace(/\D/g, "")
        const centsValue = parseInt(rawValue || "0", 10)

        onChange?.(centsValue)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        // Auto-select contents so the first keystroke overwrites the default 0,00
        e.target.select()
        onFocus?.(e)
    }

    return (
        <TextInput value={displayValue} onChange={handleChange} onFocus={handleFocus} {...props} />
    )
}
