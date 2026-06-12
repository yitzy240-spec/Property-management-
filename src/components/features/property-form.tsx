'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { createProperty, updateProperty } from '@/app/(admin)/properties/actions'
import type { Property, GuestLink } from '@/types'

interface PropertyFormProps {
  property?: Property
}

export function PropertyForm({ property }: PropertyFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [owners, setOwners] = useState<{ id: string; full_name: string; email: string }[]>([])
  const [selectedOwnerId, setSelectedOwnerId] = useState(property?.owner_id || '')
  const [guestLinks, setGuestLinks] = useState<GuestLink[]>(property?.guest_links ?? [])

  useEffect(() => {
    fetch('/api/owners/list')
      .then(r => r.json())
      .then(data => setOwners(data.owners || []))
      .catch(() => {})
  }, [])

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
      entry_instructions: formData.get('entry_instructions') as string || null,
      guest_links: guestLinks
        .filter((l) => l.url.trim())
        .map((l) => ({ label: l.label.trim() || 'Link', url: l.url.trim(), hide_until_revealed: !!l.hide_until_revealed })),
      owner_id: selectedOwnerId,
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

  // Resolve current image: custom > lodgify
  const lodgifyImage = (property?.lodgify_data as { image_url?: string } | null)?.image_url
  const currentImage = property?.image_url || (lodgifyImage ? `https:${lodgifyImage}` : null)
  const isLodgifyImage = !property?.image_url && !!lodgifyImage

  return (
    <form action={handleSubmit}>
      <div className="space-y-6">
        {/* Property Image */}
        {isEditing && (
          <PropertyImageUpload
            propertyId={property.id}
            currentImage={currentImage}
            isLodgifyImage={isLodgifyImage}
          />
        )}

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
                <Label htmlFor="owner_id" className="text-xs font-medium">Owner</Label>
                <NativeSelect
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  placeholder="Select owner"
                  options={owners.map(o => ({ value: o.id, label: `${o.full_name} (${o.email})` }))}
                  className="h-11"
                />
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="entry_instructions" className="text-xs font-medium">Entry instructions</Label>
                <textarea
                  id="entry_instructions"
                  name="entry_instructions"
                  rows={3}
                  placeholder="Apartment-specific steps, e.g. 'Enter the building code, take the lift to floor 3, then turn right.'"
                  defaultValue={property?.entry_instructions ?? ''}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">Shown to guests under their entry code, on the guest check-in page.</p>
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
              <Input id="canva_design_url" name="canva_design_url" type="url" placeholder="https://canva.com/design/... or canva.link/..." defaultValue={property?.canva_design_url ?? ''} className="h-11" />
              <p className="text-xs text-muted-foreground">Paste any Canva share link (short links work too) — the guide embeds on the guest page.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Guest links</Label>
              <p className="text-xs text-muted-foreground">
                Extra videos/links shown on the guest check-in page. Tick &quot;hide until revealed&quot; for any that show the door code.
              </p>
              <div className="space-y-2">
                {guestLinks.map((link, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Label (e.g. Wifi guide)"
                        value={link.label}
                        onChange={(e) => setGuestLinks((ls) => ls.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                        className="h-9"
                      />
                      <Input
                        type="url"
                        placeholder="https://..."
                        value={link.url}
                        onChange={(e) => setGuestLinks((ls) => ls.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                        className="h-9"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={link.hide_until_revealed}
                          onChange={(e) => setGuestLinks((ls) => ls.map((l, j) => (j === i ? { ...l, hide_until_revealed: e.target.checked } : l)))}
                        />
                        Hide until code is revealed
                      </label>
                      <button
                        type="button"
                        onClick={() => setGuestLinks((ls) => ls.filter((_, j) => j !== i))}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setGuestLinks((ls) => [...ls, { label: '', url: '', hide_until_revealed: false }])}
                className="text-xs font-medium text-accent hover:underline"
              >
                + Add link
              </button>
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

function PropertyImageUpload({
  propertyId,
  currentImage,
  isLodgifyImage,
}: {
  propertyId: string
  currentImage: string | null
  isLodgifyImage: boolean
}) {
  const [image, setImage] = useState(currentImage)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [isFromLodgify, setIsFromLodgify] = useState(isLodgifyImage)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('propertyId', propertyId)

      const res = await fetch('/api/properties/image', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Upload failed')

      setImage(data.imageUrl)
      setIsFromLodgify(false)
      toast.success('Image uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const res = await fetch('/api/properties/image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Remove failed')
      }
      setImage(null)
      setIsFromLodgify(false)
      toast.success('Image removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setRemoving(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  return (
    <div className="rounded-[10px] border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Property Image</p>
      </div>
      <div className="p-4">
        {image ? (
          <div className="relative overflow-hidden rounded-lg">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
              <img src={image} alt="Property" className="h-full w-full object-cover" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isFromLodgify && (
                  <span className="rounded-[var(--radius-badge)] bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    From Lodgify
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {isFromLodgify ? 'Replace' : 'Change'}
                </Button>
                {!isFromLodgify && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                    onClick={handleRemove}
                    disabled={removing}
                  >
                    {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-10 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <ImageIcon className="h-8 w-8" />
            )}
            <span className="text-sm font-medium">
              {uploading ? 'Uploading...' : 'Click to upload property image'}
            </span>
            <span className="text-xs">JPG, PNG, WebP — max 5MB</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  )
}
