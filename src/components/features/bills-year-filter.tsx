'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface BillsYearFilterProps {
  /** Currently-selected year, or "all". */
  selected: string
  /** Years that have at least one approved bill for this owner. */
  years: string[]
}

/**
 * Year selector for the owner-portal Bills section. Submits via
 * client-side router.replace to update only the bills_year query
 * param — preserves any other state and resets bills_page so the
 * paginator lands on page 1 of the newly-filtered set.
 */
export function BillsYearFilter({ selected, years }: BillsYearFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setYear(year: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('bills_year', year)
    params.delete('bills_page')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <select
      value={selected}
      onChange={(e) => setYear(e.target.value)}
      className="h-7 rounded-md border border-border bg-card px-2 text-xs"
    >
      {years.map(y => (
        <option key={y} value={y}>{y}</option>
      ))}
      <option value="all">All</option>
    </select>
  )
}
