export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const profileColors: Record<string, string> = {
  investor: 'bg-blue-100 text-blue-800',
  hybrid: 'bg-purple-100 text-purple-800',
  private: 'bg-green-100 text-green-800',
}

export default async function OwnersPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: owners } = await serviceClient
    .from('owners')
    .select('*, properties(id, name)')
    .order('full_name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Owners</h1>
          <p className="text-sm text-muted-foreground">
            {owners?.length ?? 0} owners
          </p>
        </div>
        <Link href="/owners/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Owner
          </Button>
        </Link>
      </div>

      {owners && owners.length > 0 ? (
        <div className="space-y-3">
          {owners.map((owner) => {
            const properties = owner.properties as { id: string; name: string }[] | null
            return (
              <div key={owner.id}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{owner.full_name}</h3>
                        <Badge className={`text-[10px] ${profileColors[owner.profile] || ''}`}>
                          {owner.profile}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{owner.email}</p>
                      {properties && properties.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {properties.length} {properties.length === 1 ? 'property' : 'properties'}: {properties.map(p => p.name).join(', ')}
                        </p>
                      )}
                    </div>
                    {owner.phone && (
                      <p className="text-sm text-muted-foreground">{owner.phone}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No owners yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first property owner.
            </p>
            <Link href="/owners/new" className="mt-4">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Owner
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
