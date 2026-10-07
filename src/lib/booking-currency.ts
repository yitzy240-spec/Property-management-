/**
 * Booking amounts are stored in the currency they were entered/synced in
 * (`gross_rental_agorot` = smallest unit of `bookings.currency`, e.g. USD
 * cents). Nothing converts on entry. Conversion to ILS happens only where
 * an ILS figure is genuinely needed — owner statements — using the rate
 * saved on the booking.
 */

/** Default USD→ILS rate: pre-filled in the booking form, and used on statements
 *  for USD bookings that carry no rate of their own (e.g. Lodgify-synced). */
export const DEFAULT_USD_ILS_RATE = 3.7

const SYMBOLS: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€' }

function money(minor: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `
  return `${symbol}${(minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export interface IlsConversion {
  /** Amount in ILS agorot (0 when it could not be converted). */
  agorot: number
  /** False when a non-ILS amount had no usable rate — needs a manual amount. */
  converted: boolean
  /** Human label for statements, e.g. "$1,000 × 3.70 = ₪3,700". */
  label: string
}

export function toIlsAgorot(
  amountMinor: number,
  currency: string | null | undefined,
  exchangeRate: number | null | undefined,
): IlsConversion {
  const cur = (currency || 'ILS').toUpperCase()
  if (cur === 'ILS') {
    return { agorot: amountMinor, converted: true, label: money(amountMinor, 'ILS') }
  }

  const ownRate = exchangeRate && exchangeRate > 0 ? Number(exchangeRate) : null
  const rate = ownRate ?? (cur === 'USD' ? DEFAULT_USD_ILS_RATE : null)
  if (!rate) {
    return {
      agorot: 0,
      converted: false,
      label: `${money(amountMinor, cur)} — no exchange rate, enter the ₪ amount`,
    }
  }

  const agorot = Math.round(amountMinor * rate)
  const defaultNote = ownRate ? '' : ' (default rate)'
  return {
    agorot,
    converted: true,
    label: `${money(amountMinor, cur)} × ${rate.toFixed(2)} = ${money(agorot, 'ILS')}${defaultNote}`,
  }
}
