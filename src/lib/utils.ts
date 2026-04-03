import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert agorot (integer) to ILS string with ₪ symbol */
export function formatILS(agorot: number): string {
  const shekel = agorot / 100
  return `₪${shekel.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Convert ILS amount to agorot for storage */
export function toAgorot(ils: number): number {
  return Math.round(ils * 100)
}

/** Format date for Jerusalem timezone display */
export function formatDateJerusalem(dateStr: string, format: 'short' | 'long' = 'short'): string {
  const date = new Date(dateStr)
  const options: Intl.DateTimeFormatOptions = format === 'short'
    ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jerusalem' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }
  return date.toLocaleDateString('en-IL', options)
}

/** VAT threshold constants */
export const VAT_THRESHOLD_AGOROT = 12_283_300 // ₪122,833
export const VAT_WARNING_PERCENT = 0.9
