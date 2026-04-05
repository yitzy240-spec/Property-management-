export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function PropertiesPage() {
  const supabase = createServiceClient()

  const { data: properties } = await supabase
    .from('properties')
    .select('*, owners(full_name, profile)')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Properties</h1>
          <p className="text-xs text-muted-foreground">
            {properties?.length ?? 0} active
          </p>
        </div>
        <Link href="/properties/new">
          <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </Link>
      </div>

      {properties && properties.length > 0 ? (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          {properties.map((property, i) => {
            const owner = property.owners as { full_name: string; profile: string } | null
            return (
              <Link key={property.id} href={`/properties/${property.id}`} className="block">
                <div className={`flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-muted/40 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{property.name}</h3>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {Math.round(property.commission_rate * 100)}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{property.address}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {property.num_bedrooms} bed · {property.neighborhood || property.city}
                      </span>
                      {owner && (
                        <>
                          <span className="text-xs text-border">·</span>
                          <span className="text-xs text-muted-foreground">{owner.full_name}</span>
                          <StatusBadge status={owner.profile === 'investor' ? 'info' : owner.profile === 'hybrid' ? 'warning' : 'safe'} label={owner.profile} size="sm" />
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-12 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No properties yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first property to get started.</p>
          <Link href="/properties/new" className="mt-4 inline-block">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Property
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
