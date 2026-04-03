'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import type { Property } from '@/types'

interface PropertyFormProps {
  property?: Property
}

export function PropertyForm({ property }: PropertyFormProps) {
  const router = useRouter()
  const supabase = createClient()
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
      youtube_tutorial_url: formData.get('youtube_tutorial_url') as string || null,
      owner_id: formData.get('owner_id') as string,
      commission_rate: parseFloat(formData.get('commission_rate') as string) || 0.20,
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('properties')
        .update(data)
        .eq('id', property.id)
      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }
      router.push(`/properties/${property.id}`)
    } else {
      const { error: insertError } = await supabase
        .from('properties')
        .insert(data)
      if (insertError) {
        setError(insertError.message)
        setLoading(false)
        return
      }
      router.push('/properties')
    }

    router.refresh()
  }

  return (
    <form action={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Property Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Yafo 42"
                defaultValue={property?.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner_id">Owner</Label>
              <Input
                id="owner_id"
                name="owner_id"
                placeholder="Owner UUID (select coming soon)"
                defaultValue={property?.owner_id}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              placeholder="42 Yafo Street"
              defaultValue={property?.address}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                defaultValue={property?.city || 'Jerusalem'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="neighborhood">Neighborhood</Label>
              <Input
                id="neighborhood"
                name="neighborhood"
                placeholder="Old City"
                defaultValue={property?.neighborhood ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commission_rate">Commission %</Label>
              <Input
                id="commission_rate"
                name="commission_rate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                defaultValue={property?.commission_rate ?? 0.20}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="num_bedrooms">Bedrooms</Label>
              <Input
                id="num_bedrooms"
                name="num_bedrooms"
                type="number"
                min="0"
                defaultValue={property?.num_bedrooms ?? 1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="num_beds">Beds</Label>
              <Input
                id="num_beds"
                name="num_beds"
                type="number"
                min="0"
                defaultValue={property?.num_beds ?? 1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry_code">Entry Code</Label>
              <Input
                id="entry_code"
                name="entry_code"
                placeholder="4829"
                className="font-mono"
                defaultValue={property?.entry_code ?? ''}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="youtube_tutorial_url">YouTube Tutorial URL</Label>
            <Input
              id="youtube_tutorial_url"
              name="youtube_tutorial_url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              defaultValue={property?.youtube_tutorial_url ?? ''}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update Property' : 'Create Property'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
