import { cn } from '@/lib/utils'

type CurrencyVariant = 'default' | 'income' | 'expense' | 'net' | 'hero'

interface CurrencyDisplayProps {
  /** Amount in agorot (integer). Converted to ILS for display. */
  agorot: number
  variant?: CurrencyVariant
  className?: string
  showSign?: boolean
}

const variantStyles: Record<CurrencyVariant, string> = {
  default: 'text-foreground',
  income: 'text-financial-income',
  expense: 'text-financial-expense',
  net: 'text-financial-net',
  hero: 'text-foreground text-[length:var(--text-hero)] font-bold',
}

/**
 * Universal currency display component.
 * - Always uses monospace font with tabular-nums
 * - Converts agorot to ILS with ₪ symbol
 * - Semantic coloring via financial tokens
 */
export function CurrencyDisplay({
  agorot,
  variant = 'default',
  className,
  showSign = false,
}: CurrencyDisplayProps) {
  const ils = agorot / 100
  const sign = showSign && agorot > 0 ? '+' : ''
  const formatted = `${sign}₪${Math.abs(ils).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        variantStyles[variant],
        className
      )}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {formatted}
    </span>
  )
}
