'use client'

import { useState, useEffect, useRef } from 'react'
import { FileText, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import { BillForm, type BillFormValues } from './bill-form'

const MAX_PDF_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']

export function BillAddButton({ preselectedPropertyId }: { preselectedPropertyId?: string } = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [values, setValues] = useState<BillFormValues>({
    property_id: preselectedPropertyId ?? '',
    bill_type: 'other',
    amount_agorot: 0,
    due_date: null,
    period_start: null,
    period_end: null,
  })

  useEffect(() => {
    if (!open) return
    fetch('/api/properties/list')
      .then((r) => r.json())
      .then((data) => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open])

  function clearFile() {
    setPdfFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) {
      setPdfFile(null)
      return
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Only PDF or image files are supported')
      clearFile()
      return
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error('File is over 10 MB — please compress before uploading')
      clearFile()
      return
    }
    setPdfFile(file)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    if (!values.property_id) {
      toast.error('Select a property')
      return
    }
    setSaving(true)

    const billPayload = {
      property_id: values.property_id,
      bill_type: values.bill_type,
      amount_agorot: values.amount_agorot,
      due_date: values.due_date,
      billing_period_start: values.period_start,
      billing_period_end: values.period_end,
      status: 'approved',
      is_anomaly: false,
    }

    let res: Response
    if (pdfFile) {
      const form = new FormData()
      form.append('data', JSON.stringify(billPayload))
      form.append('file', pdfFile)
      res = await fetch('/api/bills/add', { method: 'POST', body: form })
    } else {
      res = await fetch('/api/bills/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billPayload),
      })
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error('Failed to add bill', { description: data.error })
    } else {
      toast.success('Bill added')
      setOpen(false)
      clearFile()
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={(o) => { setOpen(o); if (!o) clearFile() }}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-[var(--radius-button)]">
          <Plus className="h-3.5 w-3.5" />
          Add Bill
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Bill Manually</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <BillForm
              initial={{
                property_id: preselectedPropertyId ?? '',
                bill_type: 'other',
              }}
              properties={properties}
              onChange={setValues}
            />

            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                PDF / Photo (optional)
              </Label>
              {pdfFile ? (
                <div className="flex items-center gap-2 rounded-[10px] border border-border bg-muted/30 p-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{pdfFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(pdfFile.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="block w-full cursor-pointer rounded-[10px] border border-border bg-card text-xs file:mr-3 file:cursor-pointer file:rounded-l-[10px] file:border-0 file:bg-muted file:px-3 file:py-2.5 file:text-xs file:font-medium hover:file:bg-muted/70"
                />
              )}
            </div>

            <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Adding...' : 'Add Bill'}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
