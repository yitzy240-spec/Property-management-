'use client'

import { useState, useEffect } from 'react'
import { Plus, Plug, Copy, Check, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'

interface UtilityAccount {
  id: string
  utility_type: string
  label: string
  account_number: string
  provider_name: string | null
  autopay: boolean
  notes: string | null
}

const utilityLabels: Record<string, string> = {
  gas: 'Gas (פזגז)',
  water: 'Water (הגיחון)',
  iec: 'Electricity (IEC)',
  arnona: 'Arnona',
  vaad_bayit: "Va'ad Bayit",
  internet: 'Internet / Bezeq',
  other: 'Other',
}

function truncate(s: string, n = 30) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function UtilityAccountsSection({ propertyId }: { propertyId: string }) {
  const supabase = createClient()
  const [accounts, setAccounts] = useState<UtilityAccount[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<UtilityAccount | null>(null)

  async function refresh() {
    const { data } = await supabase
      .from('property_utility_accounts')
      .select('*')
      .eq('property_id', propertyId)
      .order('utility_type')
    setAccounts((data ?? []) as UtilityAccount[])
  }

  useEffect(() => {
    fetch(`/api/properties/utility-accounts?property_id=${propertyId}`)
      .then(r => r.json())
      .then(data => setAccounts(data.accounts ?? []))
      .catch(() => {})
  }, [propertyId])

  function copyNumber(id: string, number: string) {
    navigator.clipboard.writeText(number)
    setCopiedId(id)
    toast.success('Account number copied')
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Utility Accounts</p>
        <AddUtilityButton propertyId={propertyId} onAdded={refresh} />
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
          No utility accounts added yet
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          {accounts.map((account, i) => (
            <div
              key={account.id}
              className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <button
                type="button"
                onClick={() => copyNumber(account.id, account.account_number)}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {utilityLabels[account.utility_type] || account.utility_type}
                  </span>
                  {account.autopay && (
                    <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-badge)] bg-[hsl(152_54%_25%/0.1)] px-1.5 py-0.5 text-xs font-medium text-financial-income">
                      <Plug className="h-2.5 w-2.5" />
                      autopay
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {account.label && `${account.label}: `}{account.account_number}
                </p>
                {account.provider_name && (
                  <p className="text-xs text-muted-foreground">{account.provider_name}</p>
                )}
                {account.notes && (
                  <p
                    className="mt-0.5 text-xs italic text-muted-foreground/80"
                    title={account.notes}
                  >
                    {truncate(account.notes, 30)}
                  </p>
                )}
              </button>
              <div className="flex items-center gap-1">
                {copiedId === account.id ? (
                  <Check className="h-4 w-4 text-status-safe" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground/50" />
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditing(account) }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Edit utility account"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EditUtilityDialog
        account={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh() }}
      />
    </section>
  )
}

function AddUtilityButton({ propertyId, onAdded }: { propertyId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [utilityType, setUtilityType] = useState('gas')
  const [autopay, setAutopay] = useState(false)

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    const res = await fetch('/api/properties/utility-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: propertyId,
        utility_type: utilityType,
        label: formData.get('label') as string || '',
        account_number: formData.get('account_number') as string,
        provider_name: formData.get('provider_name') as string || null,
        notes: formData.get('notes') as string || null,
        autopay,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      toast.error('Failed to add', { description: data.error })
    } else {
      toast.success('Utility account added')
      setOpen(false)
      onAdded()
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Utility Account</DrawerTitle>
        </DrawerHeader>
        <form action={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Utility Type</Label>
            <NativeSelect
              value={utilityType}
              onChange={(e) => setUtilityType(e.target.value)}
              options={Object.entries(utilityLabels).map(([key, label]) => ({ value: key, label }))}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Number</Label>
            <Input name="account_number" placeholder="348544166" required className="h-11 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Label</Label>
            <Input name="label" placeholder="מספר חוזה, מספר לקוח, מספר מונה..." className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provider</Label>
            <Input name="provider_name" placeholder="פזגז, הגיחון, IEC..." className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</Label>
            <Input name="notes" placeholder="Tenant ID, meter number, special instructions…" className="h-11" />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAutopay(!autopay)}
              className={`flex h-6 w-11 items-center rounded-full transition-colors ${autopay ? 'bg-financial-income' : 'bg-muted'}`}
            >
              <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${autopay ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm">Autopay enabled</span>
          </div>
          <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Adding...' : 'Add Account'}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  )
}

function EditUtilityDialog({
  account,
  onClose,
  onSaved,
}: {
  account: UtilityAccount | null
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [utilityType, setUtilityType] = useState(account?.utility_type ?? 'gas')
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '')
  const [label, setLabel] = useState(account?.label ?? '')
  const [providerName, setProviderName] = useState(account?.provider_name ?? '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [autopay, setAutopay] = useState(account?.autopay ?? false)

  // Reset form when a new account is opened
  useEffect(() => {
    if (account) {
      setUtilityType(account.utility_type)
      setAccountNumber(account.account_number)
      setLabel(account.label ?? '')
      setProviderName(account.provider_name ?? '')
      setNotes(account.notes ?? '')
      setAutopay(account.autopay)
    }
  }, [account])

  async function handleSave() {
    if (!account) return
    setSaving(true)
    const res = await fetch('/api/properties/utility-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: account.id,
        utility_type: utilityType,
        account_number: accountNumber,
        label,
        provider_name: providerName || null,
        notes: notes || null,
        autopay,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error('Failed to save', { description: data.error })
    } else {
      toast.success('Utility account updated')
      onSaved()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!account) return
    if (!confirm('Delete this utility account? This cannot be undone.')) return
    setDeleting(true)
    const res = await fetch(`/api/properties/utility-accounts?id=${encodeURIComponent(account.id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error('Failed to delete', { description: data.error })
    } else {
      toast.success('Utility account deleted')
      onSaved()
    }
    setDeleting(false)
  }

  return (
    <Drawer open={!!account} onOpenChange={(v) => { if (!v) onClose() }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit Utility Account</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Utility Type</Label>
            <NativeSelect
              value={utilityType}
              onChange={(e) => setUtilityType(e.target.value)}
              options={Object.entries(utilityLabels).map(([key, label]) => ({ value: key, label }))}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Number</Label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="348544166"
              className="h-11 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="מספר חוזה, מספר לקוח, מספר מונה..."
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provider</Label>
            <Input
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="פזגז, הגיחון, IEC..."
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tenant ID, meter number, special instructions…"
              className="h-11"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAutopay(!autopay)}
              className={`flex h-6 w-11 items-center rounded-full transition-colors ${autopay ? 'bg-financial-income' : 'bg-muted'}`}
            >
              <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${autopay ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm">Autopay enabled</span>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="h-11 gap-2 text-status-danger hover:text-status-danger"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting || !accountNumber}
              className="h-11 flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
