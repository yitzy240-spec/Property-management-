'use client'

import { useState } from 'react'
import { Check, Camera, Receipt, ExternalLink, CheckCircle2, Minus, Plus, Globe, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'

// ── i18n ──

const translations = {
  en: {
    taskAssignment: 'Task Assignment',
    buildingEntrance: 'Building Entrance',
    apartmentCode: 'Apartment Code',
    watchTutorial: 'Watch Apartment Tutorial',
    checklist: 'Checklist',
    uploadPhotos: 'Upload Photos',
    photoDesc: 'Take photos of completed work for the owner record.',
    tapToUpload: 'Tap to take or upload photo',
    expense: 'Expense (optional)',
    expenseDesc: 'Log any materials purchased for this task.',
    completeTask: 'Complete Task',
    confirmCompletion: 'Confirm Completion',
    confirmDesc: 'This will mark the task as done and notify the property manager.',
    yesComplete: 'Yes, Complete Task',
    cancel: 'Cancel',
    completeAllItems: 'Complete all checklist items to submit',
    taskComplete: 'Task Complete',
    thankYou: 'Thank you! Your work has been logged.',
    laundryCount: 'Laundry Count',
    laundryDesc: 'Mark how many of each item are being sent to laundry.',
    submitLaundry: 'Submit Laundry Count',
    laundrySubmitted: 'Laundry count submitted',
    submitting: 'Submitting...',
    waze: 'Waze',
    receipt: 'Receipt',
  },
  he: {
    taskAssignment: 'משימה',
    buildingEntrance: 'כניסה לבניין',
    apartmentCode: 'קוד לדירה',
    watchTutorial: 'צפה בסרטון הדרכה',
    checklist: 'רשימת משימות',
    uploadPhotos: 'העלאת תמונות',
    photoDesc: 'צלם תמונות של העבודה שהושלמה.',
    tapToUpload: 'לחץ לצלם או להעלות תמונה',
    expense: 'הוצאה (לא חובה)',
    expenseDesc: 'רשום חומרים שנרכשו למשימה.',
    completeTask: 'סיום משימה',
    confirmCompletion: 'אישור סיום',
    confirmDesc: 'פעולה זו תסמן את המשימה כהושלמה ותשלח הודעה למנהל.',
    yesComplete: 'כן, סיים משימה',
    cancel: 'ביטול',
    completeAllItems: 'השלם את כל הפריטים ברשימה',
    taskComplete: 'המשימה הושלמה',
    thankYou: '!תודה! העבודה נרשמה',
    laundryCount: 'ספירת כביסה',
    laundryDesc: 'סמן כמה מכל פריט נשלח לכביסה.',
    submitLaundry: 'שלח ספירת כביסה',
    laundrySubmitted: 'ספירת כביסה נשלחה',
    submitting: '...שולח',
    waze: 'Waze',
    receipt: 'קבלה',
  },
}

// ── Laundry item icon mapping ──

const ITEM_ICONS: Record<string, string> = {
  // Match by keyword in item name (case-insensitive)
  'pillow': '/laundry/pillow-case.svg',
  'blanket': '/laundry/blanket-cover.svg',
  'duvet': '/laundry/blanket-cover.svg',
  'sheet': '/laundry/fitted-sheet.svg',
  'bath towel': '/laundry/shower-towel.svg',
  'shower towel': '/laundry/shower-towel.svg',
  'towel': '/laundry/shower-towel.svg',
  'face towel': '/laundry/face-towel.svg',
  'hand towel': '/laundry/face-towel.svg',
}

function getItemIcon(itemName: string): string {
  const lower = itemName.toLowerCase()
  // Check longest matches first for specificity
  const keys = Object.keys(ITEM_ICONS).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) return ITEM_ICONS[key]
  }
  return '/laundry/fitted-sheet.svg' // default
}

// ── Types ──

interface ContractorTaskViewProps {
  token: string
  property: {
    id: string
    name: string
    address: string
    entry_code: string | null
    building_entry_code: string | null
    youtube_tutorial_url: string | null
  }
  task: {
    id: string
    title: string
    description: string | null
    status: string
    is_cleaning?: boolean
  } | null
  checklistItems: {
    id: string
    label: string
    is_completed: boolean
    sort_order: number
  }[]
  magicLinkId: string
  inventoryItems?: { item_name: string; quantity_in_closet: number }[]
}

export function ContractorTaskView({
  token,
  property,
  task,
  checklistItems: initialItems,
  magicLinkId,
  inventoryItems = [],
}: ContractorTaskViewProps) {
  const [lang, setLang] = useState<'en' | 'he'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('contractor_lang') as 'en' | 'he') || 'en'
    }
    return 'en'
  })
  const t = translations[lang]
  const isRtl = lang === 'he'

  const [checklist, setChecklist] = useState(initialItems)
  const [completed, setCompleted] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Laundry counts — use actual inventory items from the property
  const [laundryCounts, setLaundryCounts] = useState<Record<string, number>>(
    Object.fromEntries(inventoryItems.map(i => [i.item_name, 0]))
  )
  const [laundrySubmitted, setLaundrySubmitted] = useState(false)
  const [laundrySubmitting, setLaundrySubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const completedCount = checklist.filter((i) => i.is_completed).length
  const totalCount = checklist.length
  const allChecked = totalCount > 0 && completedCount === totalCount
  const showLaundry = inventoryItems.length > 0

  function adjustCount(key: string, delta: number) {
    setLaundryCounts(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }))
  }

  async function toggleItem(itemId: string) {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, is_completed: !item.is_completed }
          : item
      )
    )

    await fetch('/api/contractor/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, item_id: itemId }),
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'receipt') {
    const file = e.target.files?.[0]
    if (!file || !task) return

    const MAX_SIZE = 25 * 1024 * 1024
    if (file.size > MAX_SIZE) { toast.error('File too large (max 25MB)'); return }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast.error('Only images and videos'); return }

    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('token', token)
    form.append('task_id', task.id)
    form.append('media_type', file.type.startsWith('video') ? 'video' : 'image')
    if (type === 'receipt') form.append('caption', 'Expense receipt')

    try {
      const res = await fetch('/api/contractor/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }
      toast.success(type === 'receipt' ? 'Receipt uploaded' : 'Photo uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmitLaundry() {
    setLaundrySubmitting(true)
    try {
      const items = inventoryItems
        .filter(i => laundryCounts[i.item_name] > 0)
        .map(i => ({ item_name: i.item_name, quantity: laundryCounts[i.item_name] }))

      const res = await fetch('/api/contractor/laundry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, items }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }

      setLaundrySubmitted(true)
      toast.success(t.laundrySubmitted)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLaundrySubmitting(false)
    }
  }

  async function handleComplete() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/contractor/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          task_id: task?.id,
          expense_agorot: expenseAmount ? Math.round(parseFloat(expenseAmount) * 100) : 0,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to complete task. Please try again.')
        setSubmitting(false)
        return
      }
      setCompleted(true)
    } catch {
      toast.error('Network error. Please check your connection and try again.')
    }
    setSubmitting(false)
  }

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] p-4">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-status-safe" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">{t.taskComplete}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.thankYou}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[#FAFAFA]" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" className="h-6 w-auto" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">ApartmentOS</p>
          </div>
          <button
            onClick={() => { const next = lang === 'en' ? 'he' : 'en'; localStorage.setItem('contractor_lang', next); setLang(next) }}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            <Globe className="h-3.5 w-3.5" />
            {lang === 'en' ? 'עברית' : 'English'}
          </button>
        </div>
        <h1 className="mt-1 text-lg font-semibold">{t.taskAssignment}</h1>
      </div>

      <div className="space-y-4 p-4">
        {/* Property Info + Entry Code */}
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold">{property.name}</h2>
              <p className="text-xs text-muted-foreground">{property.address}</p>
            </div>
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(property.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t.waze}
            </a>
          </div>

          {(property.entry_code || property.building_entry_code) && (
            <div className="mt-3 space-y-2">
              {property.building_entry_code && (
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t.buildingEntrance}</p>
                  <p className="mt-1 font-mono text-2xl font-bold tracking-[0.15em]">{property.building_entry_code}</p>
                </div>
              )}
              {property.entry_code && (
                <div className="rounded-lg bg-primary/5 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t.apartmentCode}</p>
                  <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em]">{property.entry_code}</p>
                </div>
              )}
            </div>
          )}

          {property.youtube_tutorial_url && (
            <a href={property.youtube_tutorial_url} target="_blank" rel="noopener noreferrer" className="mt-3 block">
              <Button variant="outline" size="sm" className="w-full gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                {t.watchTutorial}
              </Button>
            </a>
          )}
        </div>

        {/* Task Details */}
        {task && (
          <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">{task.title}</h3>
            {task.description && (
              <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{task.description}</p>
            )}
          </div>
        )}

        {/* Checklist */}
        {checklist.length > 0 && (
          <div className="rounded-[10px] border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t.checklist}</p>
                <span className="font-mono text-xs text-muted-foreground">{completedCount}/{totalCount}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-status-safe transition-[width] duration-500 ease-out"
                  style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="p-1">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.98]"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      item.is_completed
                        ? 'border-status-safe bg-status-safe text-white'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    {item.is_completed && <Check className="h-4 w-4" />}
                  </div>
                  <span className={`text-sm ${item.is_completed ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Laundry Count — shown only for cleaning tasks with inventory items */}
        {showLaundry && (
          <div className="rounded-[10px] border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">{t.laundryCount}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.laundryDesc}</p>
            </div>
            <div className="p-2">
              {inventoryItems.map((item) => (
                <div key={item.item_name} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <img src={getItemIcon(item.item_name)} alt={item.item_name} className="h-10 w-10 object-contain" />
                    <div>
                      <p className="text-sm font-medium">{item.item_name}</p>
                      <p className="text-[10px] text-muted-foreground">in closet: {item.quantity_in_closet}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustCount(item.item_name, -1)}
                      disabled={laundryCounts[item.item_name] === 0 || laundrySubmitted}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center font-mono text-lg font-bold">
                      {laundryCounts[item.item_name] || 0}
                    </span>
                    <button
                      onClick={() => adjustCount(item.item_name, 1)}
                      disabled={laundrySubmitted}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!laundrySubmitted ? (
              <div className="border-t border-border p-3">
                <Button
                  onClick={handleSubmitLaundry}
                  disabled={laundrySubmitting || Object.values(laundryCounts).every(v => v === 0)}
                  className="h-11 w-full"
                >
                  {laundrySubmitting ? t.submitting : t.submitLaundry}
                </Button>
              </div>
            ) : (
              <div className="border-t border-border p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-status-safe">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">{t.laundrySubmitted}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Photo Upload */}
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <Label className="text-xs font-semibold">{t.uploadPhotos}</Label>
          <p className="mb-3 text-xs text-muted-foreground">{t.photoDesc}</p>
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-sm text-muted-foreground transition-colors ${uploading ? 'opacity-60' : 'hover:border-primary hover:text-primary'}`}>
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {uploading ? 'Uploading...' : t.tapToUpload}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleFileUpload(e, 'photo')}
            />
          </label>
        </div>

        {/* Expense */}
        <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
          <Label className="text-xs font-semibold">{t.expense}</Label>
          <p className="mb-3 text-xs text-muted-foreground">{t.expenseDesc}</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">&#8362;</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="h-11 pl-7 font-mono"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
            </div>
            <label className="flex h-11 cursor-pointer items-center gap-1 rounded-[var(--radius-button)] border border-border px-3 text-xs text-muted-foreground hover:bg-muted">
              <Receipt className="h-3.5 w-3.5" />
              {t.receipt}
              <input
                type="file"
                accept="image/*"
                  className="hidden"
                onChange={(e) => handleFileUpload(e, 'receipt')}
              />
            </label>
          </div>
        </div>

        {/* Complete */}
        <Drawer>
          <DrawerTrigger asChild>
            <Button
              disabled={totalCount > 0 && !allChecked}
              className="h-12 w-full rounded-[var(--radius-button)] bg-status-safe text-base font-semibold hover:bg-status-safe/90"
            >
              {t.completeTask}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t.confirmCompletion}</DrawerTitle>
              <DrawerDescription>{t.confirmDesc}</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button
                onClick={handleComplete}
                disabled={submitting}
                className="h-12 w-full rounded-[var(--radius-button)] bg-status-safe text-base font-semibold hover:bg-status-safe/90"
              >
                {submitting ? t.submitting : t.yesComplete}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline" className="w-full">{t.cancel}</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {totalCount > 0 && !allChecked && (
          <p className="text-center text-xs text-muted-foreground">{t.completeAllItems}</p>
        )}
      </div>
    </div>
  )
}
