import { TextInput } from "@mantine/core"
import type { TextInputProps } from "@mantine/core"

interface CurrencyInputProps extends Omit<TextInputProps, 'value' | 'onChange'> {
    value?: number
    onChange?: (value: number) => void
}

export function CurrencyInput({ value, onChange, onFocus, ...props }: CurrencyInputProps) {
    // Format the incoming float (e.g., 1.23) to a BRL string (R$ 1,23)
    const displayValue = typeof value === 'number'
        ? new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
        : ''

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Extract only digits, handling raw keystrokes as cents
        const rawValue = e.target.value.replace(/\D/g, '')

        // Shift digits to the left for the cents
        const floatValue = parseInt(rawValue || '0', 10) / 100

        // Mantine's useForm handles direct value injection
        onChange?.(floatValue)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        // Auto-select contents so the first keystroke overwrites the default 0,00
        e.target.select()
        onFocus?.(e)
    }

    return (
        <TextInput
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            {...props}
        />
    )
}
