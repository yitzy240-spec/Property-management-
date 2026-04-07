export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function PropertiesPage() {
  const supabase = createServiceClient()

  const { data: properties } = await supabase
    .from('properties')
    .select('*, owners(full_name, profile), lodgify_data')
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
          <Button size="sm" className="h-9 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </Link>
      </div>

      {properties && properties.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => {
            const owner = property.owners as { full_name: string; profile: string } | null
            const ld = property.lodgify_data as { image_url?: string; min_price?: number; max_price?: number; currency_code?: string } | null
            const heroImage = (property as Record<string, unknown>).image_url as string | null
              || (ld?.image_url ? `https:${ld.image_url}` : null)
            const profileStatus = owner?.profile === 'investor' ? 'info' : owner?.profile === 'hybrid' ? 'warning' : 'safe'

            return (
              <Link key={property.id} href={`/properties/${property.id}`} className="group block">
                <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                  {/* Hero image */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                    {heroImage ? (
                      <img
                        src={heroImage}
                        alt={property.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    {/* Commission badge overlay */}
                    <div className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur-sm">
                      {Math.round(property.commission_rate * 100)}%
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-3.5">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{property.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{property.neighborhood || property.city}</p>
                      </div>
                      {ld?.min_price != null && (
                        <p className="shrink-0 font-mono text-sm font-bold">
                          {Math.round(ld.min_price)} <span className="text-[10px] font-normal text-muted-foreground">{ld.currency_code || 'USD'}/nt</span>
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {property.num_bedrooms} bed · {property.num_beds} beds
                      </span>
                      {owner && (
                        <>
                          <span className="text-[10px] text-border">·</span>
                          <span className="truncate text-[10px] text-muted-foreground">{owner.full_name}</span>
                        </>
                      )}
                    </div>

                    {owner && (
                      <div className="mt-2">
                        <StatusBadge status={profileStatus} label={owner.profile} size="sm" />
                      </div>
                    )}
                  </div>
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
