export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { OwnerForm } from '@/components/features/owner-form'

export default async function OwnerDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const serviceClient = createServiceClient()

  const { data: owner } = await serviceClient
    .from('owners')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!owner) notFound()

  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name, address, commission_rate')
    .eq('owner_id', params.id)
    .eq('is_active', true)

  const propertyIds = properties?.map(p => p.id) ?? []

  const [
    { data: bills },
    { data: tasks },
    { data: documents },
  ] = await Promise.all([
    propertyIds.length > 0
      ? serviceClient.from('bills').select('amount_agorot').in('property_id', propertyIds).eq('status', 'approved')
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? serviceClient.from('tasks').select('id, status').in('property_id', propertyIds)
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? serviceClient.from('documents').select('id').in('property_id', propertyIds)
      : Promise.resolve({ data: [] }),
  ])

  const totalBills = (bills ?? []).reduce((s, b) => s + b.amount_agorot, 0)
  const openTasks = (tasks ?? []).filter(t => t.status === 'pending' || t.status === 'in_progress').length
  const profileStatus = owner.profile === 'investor' ? 'info' : owner.profile === 'hybrid' ? 'warning' : 'safe'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/owners" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{owner.full_name}</h1>
            <StatusBadge status={profileStatus} label={owner.profile} size="sm" />
          </div>
          <p className="text-xs text-muted-foreground">{owner.email}</p>
          {owner.phone && <p className="font-mono text-xs text-muted-foreground">{owner.phone}</p>}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <div className="bg-card px-3 py-3 text-center">
          <p className="font-mono text-lg font-bold">{properties?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">Properties</p>
        </div>
        <div className="bg-card px-3 py-3 text-center">
          <p className="font-mono text-lg font-bold text-status-warning">{openTasks}</p>
          <p className="text-xs text-muted-foreground">Open Tasks</p>
        </div>
        <div className="bg-card px-3 py-3 text-center">
          <CurrencyDisplay agorot={totalBills} className="text-lg font-bold" />
          <p className="text-xs text-muted-foreground">Total Bills</p>
        </div>
      </div>

      {/* Properties */}
      {properties && properties.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Properties ({properties.length})
          </p>
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {properties.map((property, i) => (
              <Link key={property.id} href={`/properties/${property.id}`} className="block">
                <div className={`flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div>
                    <p className="text-sm font-semibold">{property.name}</p>
                    <p className="text-xs text-muted-foreground">{property.address}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{Math.round(property.commission_rate * 100)}%</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Edit Form */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Edit Owner
        </p>
        <OwnerForm owner={owner} />
      </section>
    </div>
  )
}
