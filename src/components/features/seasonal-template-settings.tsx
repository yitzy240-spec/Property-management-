'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'

const monthNames = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface SeasonalTemplate {
  id: string
  season_type: string
  title: string
  description: string | null
  checklist_items: string[]
  month_trigger: number
  is_active: boolean
}

export function SeasonalTemplateSettings() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<SeasonalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('seasonal_templates')
        .select('*')
        .order('month_trigger')
      setTemplates((data as SeasonalTemplate[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleCreate(formData: FormData) {
    setSaving(true)
    const title = formData.get('title') as string
    const description = formData.get('description') as string || null
    const seasonType = formData.get('season_type') as string
    const monthTrigger = parseInt(formData.get('month_trigger') as string)
    const itemsRaw = formData.get('checklist_items') as string
    const checklistItems = itemsRaw.split('\n').map(s => s.trim()).filter(Boolean)

    const { data, error } = await supabase
      .from('seasonal_templates')
      .insert({
        title,
        description,
        season_type: seasonType,
        month_trigger: monthTrigger,
        checklist_items: checklistItems,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      toast.error('Failed to create template', { description: error.message })
    } else if (data) {
      setTemplates(prev => [...prev, data as SeasonalTemplate])
      toast.success('Template created')
    }
    setSaving(false)
    setDrawerOpen(false)
  }

  async function toggleActive(id: string, isActive: boolean) {
    await supabase
      .from('seasonal_templates')
      .update({ is_active: !isActive })
      .eq('id', id)
    setTemplates(prev =>
      prev.map(t => t.id === id ? { ...t, is_active: !isActive } : t)
    )
    toast.success(isActive ? 'Template disabled' : 'Template enabled')
  }

  async function deleteTemplate(id: string) {
    await supabase.from('seasonal_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
    toast.success('Template deleted')
  }

  if (loading) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
        Loading templates...
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Seasonal Maintenance</h3>
          <p className="text-xs text-muted-foreground">Auto-scheduled tasks based on Jerusalem seasons.</p>
        </div>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button size="sm" className="h-8 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>New Seasonal Template</DrawerTitle>
            </DrawerHeader>
            <div className="max-h-[70vh] overflow-y-auto">
              <form action={handleCreate} className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</Label>
                  <Input id="title" name="title" placeholder="Window Seal Check" required className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
                  <Input id="description" name="description" placeholder="Optional description" className="h-11" />
                </div>
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Season Type</Label>
                    <Select name="season_type" defaultValue="rain_roof">
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rain_roof">Rain / Roof</SelectItem>
                        <SelectItem value="boiler_heating">Boiler / Heating</SelectItem>
                        <SelectItem value="ac_clean">AC Clean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trigger Month</Label>
                    <Select name="month_trigger" defaultValue="9">
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {monthNames.slice(1).map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checklist_items" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist (one per line)</Label>
                  <textarea
                    id="checklist_items"
                    name="checklist_items"
                    className="flex min-h-[100px] w-full rounded-[var(--radius-button)] border border-input bg-background px-3 py-2 text-sm"
                    placeholder={"Check roof for cracks\nClear drainage pipes\nInspect window seals"}
                    required
                  />
                </div>
                <Button type="submit" className="h-11 w-full" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Template'}
                </Button>
              </form>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="p-4">
        {templates.length > 0 ? (
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`rounded-lg border border-border p-3 ${!template.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">{template.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      Triggers every {monthNames[template.month_trigger]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleActive(template.id, template.is_active)}>
                      <StatusBadge
                        status={template.is_active ? 'safe' : 'neutral'}
                        label={template.is_active ? 'Active' : 'Disabled'}
                        size="sm"
                      />
                    </button>
                    <button
                      onClick={() => deleteTemplate(template.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {template.checklist_items && template.checklist_items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.checklist_items.map((item, i) => (
                      <span key={i} className="rounded-[var(--radius-badge)] bg-muted px-1.5 py-0.5 text-xs font-medium">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No templates configured yet
          </p>
        )}
      </div>
    </div>
  )
}
