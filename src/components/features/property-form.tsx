'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createProperty, updateProperty } from '@/app/(admin)/properties/actions'
import type { Property } from '@/types'

interface PropertyFormProps {
  property?: Property
}

export function PropertyForm({ property }: PropertyFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!property

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const data = {
      name: formData.get('name') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string || 'Jerusalem',
      neighborhood: formData.get('neighborhood') as string || null,
      num_bedrooms: parseInt(formData.get('num_bedrooms') as string) || 1,
      num_beds: parseInt(formData.get('num_beds') as string) || 1,
      entry_code: formData.get('entry_code') as string || null,
      building_entry_code: formData.get('building_entry_code') as string || null,
      youtube_tutorial_url: formData.get('youtube_tutorial_url') as string || null,
      canva_design_url: formData.get('canva_design_url') as string || null,
      owner_id: formData.get('owner_id') as string,
      commission_rate: parseFloat(formData.get('commission_rate') as string) || 0.20,
      management_fee_agorot: Math.round((parseFloat(formData.get('management_fee') as string) || 0) * 100),
      hourly_rate_agorot: Math.round((parseFloat(formData.get('hourly_rate') as string) || 0) * 100),
      lodgify_property_id: formData.get('lodgify_property_id') as string || null,
    }

    if (isEditing) {
      const result = await updateProperty(property.id, data)
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
        setLoading(false)
        return
      }
      toast.success('Property updated')
      router.push(`/properties/${property.id}`)
    } else {
      const result = await createProperty(data)
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
        setLoading(false)
        return
      }
      toast.success('Property created')
      router.push('/properties')
    }

    router.refresh()
  }

  return (
    <form action={handleSubmit}>
      <div className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-[10px] border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Basic Info</p>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium">Property Name</Label>
                <Input id="name" name="name" placeholder="Yafo 42" defaultValue={property?.name} required className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner_id" className="text-xs font-medium">Owner ID</Label>
                <Input id="owner_id" name="owner_id" placeholder="Owner UUID" defaultValue={property?.owner_id} required className="h-11 font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address" className="text-xs font-medium">Address</Label>
              <Input id="address" name="address" placeholder="42 Yafo Street" defaultValue={property?.address} required className="h-11" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-xs font-medium">City</Label>
                <Input id="city" name="city" defaultValue={property?.city || 'Jerusalem'} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="neighborhood" className="text-xs font-medium">Neighborhood</Label>
                <Input id="neighborhood" name="neighborhood" placeholder="Old City" defaultValue={property?.neighborhood ?? ''} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry_code" className="text-xs font-medium">Apartment Code</Label>
                <Input id="entry_code" name="entry_code" placeholder="13245" className="h-11 font-mono" defaultValue={property?.entry_code ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="building_entry_code" className="text-xs font-medium">Building Code</Label>
                <Input id="building_entry_code" name="building_entry_code" placeholder="2580 (optional)" className="h-11 font-mono" defaultValue={property?.building_entry_code ?? ''} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="num_bedrooms" className="text-xs font-medium">Bedrooms</Label>
                <Input id="num_bedrooms" name="num_bedrooms" type="number" min="0" defaultValue={property?.num_bedrooms ?? 1} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="num_beds" className="text-xs font-medium">Beds</Label>
                <Input id="num_beds" name="num_beds" type="number" min="0" defaultValue={property?.num_beds ?? 1} className="h-11" />
              </div>
            </div>
          </div>
        </div>

        {/* Financial */}
        <div className="rounded-[10px] border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Financial</p>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="commission_rate" className="text-xs font-medium">Commission Rate</Label>
                <Input id="commission_rate" name="commission_rate" type="number" step="0.01" min="0" max="1" defaultValue={property?.commission_rate ?? 0.20} className="h-11 font-mono" />
                <p className="text-xs text-muted-foreground">0.20 = 20%</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="management_fee" className="text-xs font-medium">Monthly Fee (ILS)</Label>
                <Input id="management_fee" name="management_fee" type="number" step="0.01" min="0" defaultValue={(property?.management_fee_agorot ?? 0) / 100} className="h-11 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hourly_rate" className="text-xs font-medium">Hourly Rate (ILS)</Label>
                <Input id="hourly_rate" name="hourly_rate" type="number" step="0.01" min="0" defaultValue={(property?.hourly_rate_agorot ?? 0) / 100} className="h-11 font-mono" />
              </div>
            </div>
          </div>
        </div>

        {/* Integrations */}
        <div className="rounded-[10px] border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Integrations</p>
          </div>
          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="lodgify_property_id" className="text-xs font-medium">Lodgify Property ID</Label>
              <Input id="lodgify_property_id" name="lodgify_property_id" placeholder="From Lodgify URL or Settings mapper" defaultValue={property?.lodgify_property_id ?? ''} className="h-11 font-mono" />
              <p className="text-xs text-muted-foreground">Links this property to Lodgify for booking + financial sync</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="youtube_tutorial_url" className="text-xs font-medium">YouTube Tutorial URL</Label>
              <Input id="youtube_tutorial_url" name="youtube_tutorial_url" type="url" placeholder="https://youtube.com/watch?v=..." defaultValue={property?.youtube_tutorial_url ?? ''} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="canva_design_url" className="text-xs font-medium">Canva Guest Guide URL</Label>
              <Input id="canva_design_url" name="canva_design_url" type="url" placeholder="https://canva.com/design/..." defaultValue={property?.canva_design_url ?? ''} className="h-11" />
              <p className="text-xs text-muted-foreground">Image URL for the guest check-in page</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" className="h-11" disabled={loading}>
            {loading ? 'Saving...' : isEditing ? 'Update Property' : 'Create Property'}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}
