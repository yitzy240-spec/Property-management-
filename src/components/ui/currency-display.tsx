import { cn } from '@/lib/utils'

type CurrencyVariant = 'default' | 'income' | 'expense' | 'net' | 'hero'

interface CurrencyDisplayProps {
  /** Amount in smallest unit (agorot for ILS, cents for USD). */
  agorot: number
  /** Currency code. Defaults to ILS. */
  currency?: string
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

const currencySymbols: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

/**
 * Universal currency display component.
 * - Always uses monospace font with tabular-nums
 * - Converts smallest unit to display value
 * - Semantic coloring via financial tokens
 */
export function CurrencyDisplay({
  agorot,
  currency = 'ILS',
  variant = 'default',
  className,
  showSign = false,
}: CurrencyDisplayProps) {
  const amount = agorot / 100
  const sign = showSign && agorot > 0 ? '+' : ''
  const symbol = currencySymbols[currency] || currency + ' '
  const formatted = `${sign}${symbol}${Math.abs(amount).toLocaleString('he-IL', {
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
