'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createOwner, updateOwner } from '@/app/(admin)/properties/actions'
import type { Owner, OwnerProfile } from '@/types'

interface OwnerFormProps {
  owner?: Owner
}

export function OwnerForm({ owner }: OwnerFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<OwnerProfile>(owner?.profile ?? 'hybrid')

  const isEditing = !!owner

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const data = {
      full_name: formData.get('full_name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string || null,
      profile,
      notes: formData.get('notes') as string || null,
    }

    if (isEditing) {
      const result = await updateOwner(owner.id, data)
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
        setLoading(false)
        return
      }
      toast.success('Owner updated')
      router.push(`/owners/${owner.id}`)
    } else {
      const result = await createOwner(data)
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
        setLoading(false)
        return
      }
      toast.success('Owner created')
      router.push('/owners')
    }

    router.refresh()
  }

  return (
    <form action={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                name="full_name"
                placeholder="David Cohen"
                defaultValue={owner?.full_name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="david@example.com"
                defaultValue={owner?.email}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+972-50-123-4567"
                defaultValue={owner?.phone ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label>Owner Profile</Label>
              <Select value={profile} onValueChange={(v) => setProfile(v as OwnerProfile)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="investor">
                    Investor — Financials, bookings, occupancy
                  </SelectItem>
                  <SelectItem value="hybrid">
                    Hybrid — All features
                  </SelectItem>
                  <SelectItem value="private">
                    Private — Maintenance, vault only
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls which features the owner sees in their portal.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              name="notes"
              placeholder="Any internal notes about this owner..."
              defaultValue={owner?.notes ?? ''}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update Owner' : 'Create Owner'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
