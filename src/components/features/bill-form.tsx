'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { BillType } from '@/types'

export interface BillFormValues {
  property_id: string
  bill_type: BillType
  amount_agorot: number
  due_date: string | null
  period_start: string | null
  period_end: string | null
}

interface BillFormProps {
  /** Initial values to pre-fill (used by edit drawer). */
  initial?: Partial<BillFormValues>
  /** Properties list for the property selector. */
  properties: { id: string; name: string }[]
  /** Called whenever any form value changes. */
  onChange?: (values: BillFormValues) => void
  /** When true, hides the property selector (e.g. on a property page). */
  hideProperty?: boolean
  /** Field name prefix for `name=` attributes (default: no prefix). */
  formIdPrefix?: string
}

const BILL_TYPE_OPTIONS: { value: BillType; label: string }[] = [
  { value: 'arnona', label: 'Arnona' },
  { value: 'iec', label: 'Electricity (IEC)' },
  { value: 'water', label: 'Water' },
  { value: 'vaad_bayit', label: "Va'ad Bayit" },
  { value: 'internet', label: 'Internet' },
  { value: 'gas', label: 'Gas' },
  { value: 'other', label: 'Other' },
]

/**
 * Shared form fields for adding or editing a bill.
 *
 * Renders: Property selector, Bill Type, Amount (ILS), Due Date,
 * Period Start, Period End. Internal state is controlled — parent
 * receives current values via `onChange`.
 */
export function BillForm({ initial, properties, onChange, hideProperty, formIdPrefix }: BillFormProps) {
  const [propertyId, setPropertyId] = useState(initial?.property_id ?? '')
  const [billType, setBillType] = useState<BillType>(initial?.bill_type ?? 'other')
  // Display the amount as ILS (not agorot) for human entry.
  const [amountIls, setAmountIls] = useState<string>(
    initial?.amount_agorot != null ? (initial.amount_agorot / 100).toFixed(2) : ''
  )
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [periodStart, setPeriodStart] = useState(initial?.period_start ?? '')
  const [periodEnd, setPeriodEnd] = useState(initial?.period_end ?? '')

  function emitChange(next: Partial<BillFormValues>) {
    if (!onChange) return
    const merged: BillFormValues = {
      property_id: next.property_id ?? propertyId,
      bill_type: next.bill_type ?? billType,
      amount_agorot:
        next.amount_agorot ??
        (amountIls ? Math.round(parseFloat(amountIls) * 100) : 0),
      due_date: next.due_date !== undefined ? next.due_date : (dueDate || null),
      period_start: next.period_start !== undefined ? next.period_start : (periodStart || null),
      period_end: next.period_end !== undefined ? next.period_end : (periodEnd || null),
    }
    onChange(merged)
  }

  const prefix = formIdPrefix ? `${formIdPrefix}_` : ''

  return (
    <div className="space-y-4">
      {!hideProperty && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
          <NativeSelect
            name={`${prefix}property_id`}
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value)
              emitChange({ property_id: e.target.value })
            }}
            placeholder="Select property"
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bill Type</Label>
        <NativeSelect
          name={`${prefix}bill_type`}
          value={billType}
          onChange={(e) => {
            const next = e.target.value as BillType
            setBillType(next)
            emitChange({ bill_type: next })
          }}
          options={BILL_TYPE_OPTIONS}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (ILS)</Label>
        <Input
          name={`${prefix}amount`}
          type="number"
          step="0.01"
          placeholder="842.50"
          required
          className="h-11"
          value={amountIls}
          onChange={(e) => {
            setAmountIls(e.target.value)
            const ag = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0
            emitChange({ amount_agorot: ag })
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Due Date</Label>
        <Input
          name={`${prefix}due_date`}
          type="date"
          className="h-11"
          value={dueDate ?? ''}
          onChange={(e) => {
            setDueDate(e.target.value)
            emitChange({ due_date: e.target.value || null })
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period Start</Label>
          <Input
            name={`${prefix}period_start`}
            type="date"
            className="h-11"
            value={periodStart ?? ''}
            onChange={(e) => {
              setPeriodStart(e.target.value)
              emitChange({ period_start: e.target.value || null })
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period End</Label>
          <Input
            name={`${prefix}period_end`}
            type="date"
            className="h-11"
            value={periodEnd ?? ''}
            onChange={(e) => {
              setPeriodEnd(e.target.value)
              emitChange({ period_end: e.target.value || null })
            }}
          />
        </div>
      </div>
    </div>
  )
}
