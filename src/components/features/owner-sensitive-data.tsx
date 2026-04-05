'use client'

import { useState, useEffect } from 'react'
import { Plus, Eye, EyeOff, Trash2, CreditCard, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SensitiveItem {
  id: string
  data_type: 'passport' | 'credit_card_summary'
  decrypted_value: string | null
  card_last_four: string | null
  card_type: string | null
  label: string
  notes: string | null
}

export function OwnerSensitiveData({ ownerId }: { ownerId: string }) {
  const [items, setItems] = useState<SensitiveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dataType, setDataType] = useState<string>('passport')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/owners/sensitive?owner_id=${ownerId}`)
      if (res.ok) {
        const { data } = await res.json()
        setItems(data)
      }
      setLoading(false)
    }
    load()
  }, [ownerId])

  async function handleAdd(formData: FormData) {
    setSaving(true)
    const body: Record<string, string | null> = {
      owner_id: ownerId,
      data_type: dataType,
      label: formData.get('label') as string,
      notes: formData.get('notes') as string || null,
    }

    if (dataType === 'passport') {
      body.value = formData.get('value') as string
    } else {
      body.card_last_four = formData.get('card_last_four') as string
      body.card_type = formData.get('card_type') as string
    }

    const res = await fetch('/api/owners/sensitive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      setDialogOpen(false)
      // Reload
      const reload = await fetch(`/api/owners/sensitive?owner_id=${ownerId}`)
      if (reload.ok) {
        const { data } = await reload.json()
        setItems(data)
      }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/owners/sensitive?id=${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Sensitive Information</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted">
              <Plus className="h-3 w-3" />
              Add
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Sensitive Data</DialogTitle>
              </DialogHeader>
              <form action={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={dataType} onValueChange={(v) => v && setDataType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passport">Passport Number</SelectItem>
                      <SelectItem value="credit_card_summary">Credit Card (last 4 only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label</Label>
                  <Input id="label" name="label" placeholder="Main passport" required />
                </div>
                {dataType === 'passport' ? (
                  <div className="space-y-2">
                    <Label htmlFor="value">Passport Number</Label>
                    <Input id="value" name="value" placeholder="A12345678" required />
                    <p className="text-xs text-muted-foreground">Stored encrypted (AES-256-GCM)</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="card_last_four">Last 4 Digits</Label>
                      <Input id="card_last_four" name="card_last_four" maxLength={4} pattern="[0-9]{4}" placeholder="1234" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="card_type">Card Type</Label>
                      <Input id="card_type" name="card_type" placeholder="Visa" />
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">Only last 4 digits stored — full CC numbers are never saved (PCI compliance)</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input id="notes" name="notes" placeholder="Expires 03/27" />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border p-2.5">
                <div className="flex items-center gap-2.5">
                  {item.data_type === 'passport' ? (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-xs font-medium">{item.label}</p>
                    {item.data_type === 'passport' ? (
                      <p className="font-mono text-xs">
                        {visible[item.id] ? item.decrypted_value : '••••••••'}
                      </p>
                    ) : (
                      <p className="font-mono text-xs">
                        {item.card_type && `${item.card_type} `}•••• {item.card_last_four}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-muted-foreground">{item.notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {item.data_type === 'passport' && (
                    <button
                      onClick={() => setVisible(v => ({ ...v, [item.id]: !v[item.id] }))}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {visible[item.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sensitive data stored</p>
        )}
      </CardContent>
    </Card>
  )
}
