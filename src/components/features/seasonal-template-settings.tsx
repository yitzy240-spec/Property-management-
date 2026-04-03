'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
  const [dialogOpen, setDialogOpen] = useState(false)
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

    if (!error && data) {
      setTemplates(prev => [...prev, data as SeasonalTemplate])
    }
    setSaving(false)
    setDialogOpen(false)
  }

  async function toggleActive(id: string, isActive: boolean) {
    await supabase
      .from('seasonal_templates')
      .update({ is_active: !isActive })
      .eq('id', id)
    setTemplates(prev =>
      prev.map(t => t.id === id ? { ...t, is_active: !isActive } : t)
    )
  }

  async function deleteTemplate(id: string) {
    await supabase.from('seasonal_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading templates...</CardContent></Card>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Seasonal Maintenance Templates</CardTitle>
            <CardDescription>
              Auto-scheduled tasks based on Jerusalem seasons.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              Add
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Seasonal Template</DialogTitle>
              </DialogHeader>
              <form action={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="Window Seal Check" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" placeholder="Optional description" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Season Type</Label>
                    <Select name="season_type" defaultValue="rain_roof">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rain_roof">Rain / Roof</SelectItem>
                        <SelectItem value="boiler_heating">Boiler / Heating</SelectItem>
                        <SelectItem value="ac_clean">AC Clean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Trigger Month</Label>
                    <Select name="month_trigger" defaultValue="9">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {monthNames.slice(1).map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checklist_items">Checklist Items (one per line)</Label>
                  <textarea
                    id="checklist_items"
                    name="checklist_items"
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={"Check roof for cracks\nClear drainage pipes\nInspect window seals"}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Template'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.length > 0 ? templates.map((template) => (
          <div
            key={template.id}
            className={`rounded-lg border p-4 ${!template.is_active ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">{template.title}</h4>
                <p className="text-xs text-muted-foreground">
                  Triggers every {monthNames[template.month_trigger]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={template.is_active ? 'outline' : 'secondary'}
                  className="cursor-pointer text-[10px]"
                  onClick={() => toggleActive(template.id, template.is_active)}
                >
                  {template.is_active ? 'Active' : 'Disabled'}
                </Badge>
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
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {item}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No templates configured yet
          </p>
        )}
      </CardContent>
    </Card>
  )
}
