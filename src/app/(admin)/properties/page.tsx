export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus, Building2 } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export default async function PropertiesPage() {
  const supabase = createServerSupabaseClient()

  const { data: properties } = await supabase
    .from('properties')
    .select('*, owners(full_name, profile)')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground">
            {properties?.length ?? 0} active properties
          </p>
        </div>
        <Link href="/properties/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Property
          </Button>
        </Link>
      </div>

      {properties && properties.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Link key={property.id} href={`/properties/${property.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold leading-tight">
                        {property.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {property.address}
                      </p>
                    </div>
                    <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{property.num_bedrooms} bed</span>
                    <span>·</span>
                    <span>{property.neighborhood || property.city}</span>
                  </div>

                  {property.owners && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {(property.owners as { full_name: string }).full_name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {(property.owners as { profile: string }).profile}
                      </Badge>
                    </div>
                  )}

                  {property.entry_code && (
                    <div className="mt-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        Code: {property.entry_code}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No properties yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first property to get started.
            </p>
            <Link href="/properties/new" className="mt-4">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Property
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
