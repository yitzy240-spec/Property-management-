'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'

interface ContractorData {
  id?: string
  name: string
  phone: string
  email: string
  specialty: string
}

export function ContractorAddButton() {
  return <ContractorDrawer mode="add" />
}

export function ContractorEditButton({ contractor }: { contractor: { id: string; name: string; phone: string | null; email: string | null; specialty: string | null } }) {
  return <ContractorDrawer mode="edit" contractor={contractor} />
}

export function ContractorDeactivateButton({ contractorId, contractorName }: { contractorId: string; contractorName: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)

  async function handleDeactivate() {
    const { error } = await supabase
      .from('contractors')
      .update({ is_active: false })
      .eq('id', contractorId)

    if (error) {
      toast.error('Failed to deactivate', { description: error.message })
    } else {
      toast.success(`${contractorName} deactivated`)
      router.refresh()
    }
    setConfirming(false)
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Remove?</span>
        <Button size="sm" variant="outline" className="h-7 text-xs text-status-danger" onClick={handleDeactivate}>
          Yes
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>
          No
        </Button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-muted-foreground hover:text-status-danger">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function ContractorDrawer({ mode, contractor }: {
  mode: 'add' | 'edit'
  contractor?: { id: string; name: string; phone: string | null; email: string | null; specialty: string | null }
}) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    const data: ContractorData = {
      name: formData.get('name') as string,
      phone: formData.get('phone') as string || '',
      email: formData.get('email') as string || '',
      specialty: formData.get('specialty') as string || '',
    }

    if (mode === 'edit' && contractor?.id) {
      const { error } = await supabase
        .from('contractors')
        .update(data)
        .eq('id', contractor.id)

      if (error) {
        toast.error('Failed to update', { description: error.message })
      } else {
        toast.success('Contractor updated')
        setOpen(false)
        router.refresh()
      }
    } else {
      const { error } = await supabase
        .from('contractors')
        .insert({ ...data, is_active: true })

      if (error) {
        toast.error('Failed to add', { description: error.message })
      } else {
        toast.success('Contractor added')
        setOpen(false)
        router.refresh()
      }
    }
    setSaving(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {mode === 'add' ? (
          <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        ) : (
          <button className="text-xs text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{mode === 'add' ? 'Add Contractor' : 'Edit Contractor'}</DrawerTitle>
        </DrawerHeader>
        <form action={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</Label>
            <Input name="name" defaultValue={contractor?.name} placeholder="John Doe" required className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</Label>
            <Input name="phone" defaultValue={contractor?.phone || ''} placeholder="050-123-4567" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
            <Input name="email" type="email" defaultValue={contractor?.email || ''} placeholder="contractor@email.com" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Specialty</Label>
            <Input name="specialty" defaultValue={contractor?.specialty || ''} placeholder="Plumbing, Cleaning, General..." className="h-11" />
          </div>
          <Button type="submit" disabled={saving} className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Saving...' : mode === 'add' ? 'Add Contractor' : 'Save Changes'}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
