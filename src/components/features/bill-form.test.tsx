/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BillForm } from './bill-form'

const PROPERTIES = [
  { id: 'p1', name: 'Agripas 8' },
  { id: 'p2', name: 'King George 12' },
]

describe('BillForm', () => {
  it('renders all fields', () => {
    render(<BillForm properties={PROPERTIES} />)
    expect(screen.getByText('Property')).toBeDefined()
    expect(screen.getByText('Bill Type')).toBeDefined()
    expect(screen.getByText('Amount (ILS)')).toBeDefined()
    expect(screen.getByText('Due Date')).toBeDefined()
    expect(screen.getByText('Period Start')).toBeDefined()
    expect(screen.getByText('Period End')).toBeDefined()
  })

  it('hides property selector when hideProperty=true', () => {
    render(<BillForm properties={PROPERTIES} hideProperty />)
    expect(screen.queryByText('Property')).toBeNull()
  })

  it('pre-fills values when given an `initial` prop', () => {
    render(
      <BillForm
        properties={PROPERTIES}
        initial={{
          property_id: 'p2',
          bill_type: 'iec',
          amount_agorot: 84250, // ₪842.50
          due_date: '2026-05-15',
          period_start: '2026-04-01',
          period_end: '2026-04-30',
        }}
      />
    )
    // Amount should be displayed in ILS format (842.50)
    const amountInput = screen.getByPlaceholderText('842.50') as HTMLInputElement
    expect(amountInput.value).toBe('842.50')

    // Due date should match
    const dateInputs = document.querySelectorAll('input[type="date"]')
    expect((dateInputs[0] as HTMLInputElement).value).toBe('2026-05-15')
    expect((dateInputs[1] as HTMLInputElement).value).toBe('2026-04-01')
    expect((dateInputs[2] as HTMLInputElement).value).toBe('2026-04-30')

    // Property selector value
    const selects = document.querySelectorAll('select')
    expect((selects[0] as HTMLSelectElement).value).toBe('p2') // property
    expect((selects[1] as HTMLSelectElement).value).toBe('iec') // bill_type
  })

  it('emits onChange with merged values when amount changes', () => {
    const onChange = vi.fn()
    render(
      <BillForm
        properties={PROPERTIES}
        initial={{ property_id: 'p1', bill_type: 'water', amount_agorot: 5000 }}
        onChange={onChange}
      />
    )
    const amountInput = screen.getByPlaceholderText('842.50') as HTMLInputElement
    fireEvent.change(amountInput, { target: { value: '99.99' } })

    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.amount_agorot).toBe(9999)
    expect(lastCall.property_id).toBe('p1')
    expect(lastCall.bill_type).toBe('water')
  })

  it('converts ils → agorot correctly via input', () => {
    const onChange = vi.fn()
    render(<BillForm properties={PROPERTIES} onChange={onChange} />)
    const amountInput = screen.getByPlaceholderText('842.50') as HTMLInputElement

    fireEvent.change(amountInput, { target: { value: '1234.56' } })
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.amount_agorot).toBe(123456)
  })

  it('converts due_date to null when cleared', () => {
    const onChange = vi.fn()
    render(
      <BillForm
        properties={PROPERTIES}
        initial={{ due_date: '2026-05-15' }}
        onChange={onChange}
      />
    )
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: '' } })
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.due_date).toBeNull()
  })
})
