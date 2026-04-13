'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, Send, FileText, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { formatILS } from '@/lib/utils'

interface LineItem {
  property_id: string
  property_name: string
  section: string
  category: string
  description: string
  amount_agorot: number
  source_id?: string
  source_type?: string
  is_manual?: boolean
}

interface Props {
  statementId: string
  status: string
  direction: string
  lineItems: LineItem[]
  hasInvoice: boolean
  paymentUrl: string | null
}

const SECTION_LABELS: Record<string, string> = {
  bookings: 'Bookings',
  fees: 'Fees & Commission',
  incidentals: 'Incidentals & Expenses',
}

const SECTION_ORDER = ['bookings', 'fees', 'incidentals']

export function StatementEditor({ statementId, status, direction, lineItems: initialItems, hasInvoice, paymentUrl }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<LineItem[]>(initialItems)
  const [loading, setLoading] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItem, setNewItem] = useState({
    property_name: '',
    section: 'incidentals',
    description: '',
    amount: '',
  })

  const editable = status === 'draft' || status === 'pending_approval'
  const canApprove = status === 'draft' || status === 'pending_approval'
  const canReopen = status === 'approved' && !hasInvoice
  const canInvoice = status === 'approved' && !hasInvoice
  const canSend = (status === 'approved' || status === 'sent') && direction === 'owner_owes'

  const hasChanges = JSON.stringify(items) !== JSON.stringify(initialItems)

  // Group items by property, then by section
  const grouped = new Map<string, Map<string, LineItem[]>>()
  for (const item of items) {
    const propKey = item.property_name || 'General'
    if (!grouped.has(propKey)) grouped.set(propKey, new Map())
    const propGroup = grouped.get(propKey)!
    if (!propGroup.has(item.section)) propGroup.set(item.section, [])
    propGroup.get(item.section)!.push(item)
  }

  // Calculate net
  const totalCredits = items.filter(i => i.amount_agorot < 0).reduce((s, i) => s + i.amount_agorot, 0)
  const totalCharges = items.filter(i => i.amount_agorot > 0).reduce((s, i) => s + i.amount_agorot, 0)
  const net = totalCharges + totalCredits // credits are negative

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function updateItemAmount(index: number, newAmount: number) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, amount_agorot: newAmount, is_manual: true } : item))
  }

  function updateItemDescription(index: number, desc: string) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, description: desc, is_manual: true } : item))
  }

  function addItem() {
    if (!newItem.description || !newItem.amount) return
    const amountAgorot = Math.round(parseFloat(newItem.amount) * 100)
    setItems(prev => [...prev, {
      property_id: '',
      property_name: newItem.property_name || 'General',
      section: newItem.section,
      category: 'custom',
      description: newItem.description,
      amount_agorot: amountAgorot,
      is_manual: true,
    }])
    setNewItem({ property_name: '', section: 'incidentals', description: '', amount: '' })
    setShowAddForm(false)
  }

  async function saveChanges() {
    setLoading('save')
    try {
      const res = await fetch(`/api/statements/${statementId}/line-items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Statement updated')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(null)
    }
  }

  async function handleReopen() {
    setLoading('reopen')
    try {
      // Send original items — don't save accidental browser edits
      const res = await fetch(`/api/statements/${statementId}/line-items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: initialItems }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Statement reopened for editing')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reopen')
    } finally {
      setLoading(null)
    }
  }

  async function handleAction(action: 'approve' | 'create-invoice' | 'send-reminder') {
    setLoading(action)
    try {
      const endpoint = action === 'approve'
        ? `/api/statements/${statementId}/approve`
        : action === 'create-invoice'
          ? `/api/statements/${statementId}/create-invoice`
          : `/api/statements/${statementId}/send-reminder`

      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed: ${action}`)
    } finally {
      setLoading(null)
    }
  }

  // Flatten for index-based operations
  let flatIndex = -1

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {editable && hasChanges && (
          <Button size="sm" onClick={saveChanges} disabled={loading === 'save'} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {loading === 'save' ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
        {canApprove && (
          <Button size="sm" variant="default" onClick={() => handleAction('approve')} disabled={!!loading || hasChanges} className="gap-1.5 bg-status-safe hover:bg-status-safe/90 text-white">
            <Check className="h-3.5 w-3.5" />
            {loading === 'approve' ? 'Approving...' : 'Approve'}
          </Button>
        )}
        {canReopen && (
          <Button size="sm" variant="outline" onClick={handleReopen} disabled={!!loading} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            {loading === 'reopen' ? 'Reopening...' : 'Reopen for Editing'}
          </Button>
        )}
        {canInvoice && (
          <Button size="sm" variant="default" onClick={() => handleAction('create-invoice')} disabled={!!loading} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {loading === 'create-invoice' ? 'Creating...' : 'Create Invoice'}
          </Button>
        )}
        {canSend && (
          <Button size="sm" variant="outline" onClick={() => handleAction('send-reminder')} disabled={!!loading} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {loading === 'send-reminder' ? 'Sending...' : 'Send to Owner'}
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)} className="gap-1.5 ml-auto">
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </Button>
        )}
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 rounded-md bg-status-warning/10 border border-status-warning/20 px-3 py-2">
          <Save className="h-3.5 w-3.5 text-status-warning shrink-0" />
          <p className="text-xs text-status-warning">Unsaved changes — save before approving</p>
        </div>
      )}

      {/* Add item form */}
      {showAddForm && (
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Add Line Item</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Property (optional)</label>
              <input
                type="text"
                value={newItem.property_name}
                onChange={e => setNewItem(p => ({ ...p, property_name: e.target.value }))}
                placeholder="e.g. Agripas 8"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Section</label>
              <select
                value={newItem.section}
                onChange={e => setNewItem(p => ({ ...p, section: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="bookings">Bookings</option>
                <option value="fees">Fees</option>
                <option value="incidentals">Incidentals</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <input
              type="text"
              value={newItem.description}
              onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
              placeholder="e.g. Cash payment received"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Amount (ILS) — negative for credit, positive for charge</label>
            <input
              type="number"
              step="0.01"
              value={newItem.amount}
              onChange={e => setNewItem(p => ({ ...p, amount: e.target.value }))}
              placeholder="e.g. -500 (credit) or 150 (charge)"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addItem} disabled={!newItem.description || !newItem.amount}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Line items grouped by property, then section */}
      {Array.from(grouped.entries()).map(([propName, sections]) => (
        <div key={propName} className="rounded-[10px] border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
            <p className="text-sm font-semibold">{propName}</p>
          </div>

          {SECTION_ORDER.map(sectionKey => {
            const sectionItems = sections.get(sectionKey)
            if (!sectionItems || sectionItems.length === 0) return null

            return (
              <div key={sectionKey}>
                <div className="px-4 py-2 bg-muted/20 border-b border-border">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {SECTION_LABELS[sectionKey] || sectionKey}
                  </p>
                </div>
                {sectionItems.map((item) => {
                  flatIndex++
                  const idx = items.indexOf(item)
                  return (
                    <div key={flatIndex} className="flex items-center gap-2 px-4 py-2.5 border-b border-border last:border-b-0">
                      <div className="min-w-0 flex-1">
                        {editable ? (
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateItemDescription(idx, e.target.value)}
                            className="w-full bg-transparent text-sm border-none outline-none p-0"
                          />
                        ) : (
                          <p className="text-sm">{item.description}</p>
                        )}
                        {item.is_manual && (
                          <span className="text-[10px] text-status-warning">manually edited</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {editable ? (
                          <input
                            type="number"
                            step="0.01"
                            value={(item.amount_agorot / 100).toFixed(2)}
                            onChange={e => updateItemAmount(idx, Math.round(parseFloat(e.target.value || '0') * 100))}
                            className="w-28 text-right bg-transparent text-sm font-mono border border-border rounded px-2 py-0.5"
                          />
                        ) : (
                          <CurrencyDisplay agorot={item.amount_agorot} className="text-sm font-semibold" showSign />
                        )}
                        {editable && (
                          <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-status-danger p-0.5">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Property subtotal */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground">Subtotal — {propName}</p>
            <CurrencyDisplay
              agorot={Array.from(sections.values()).flat().reduce((s, i) => s + i.amount_agorot, 0)}
              className="text-sm font-bold"
              showSign
            />
          </div>
        </div>
      ))}

      {/* Net total */}
      <div className="rounded-[10px] border-2 border-border bg-card p-4 shadow-sm flex items-center justify-between">
        <p className="text-sm font-bold">
          {net > 0 ? 'Owner owes Marcus' : net < 0 ? 'Marcus owes owner' : 'Zero balance'}
        </p>
        <CurrencyDisplay
          agorot={net}
          variant={net > 0 ? 'expense' : 'income'}
          className="text-xl font-bold"
          showSign
        />
      </div>
    </div>
  )
}
