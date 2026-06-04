export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { CodeUpdateForm } from '@/components/features/code-update-form'

export default async function CodesPage() {
  const service = createServiceClient()
  const { data: properties } = await service
    .from('properties')
    .select('id, name, entry_code, building_entry_code')
    .order('name')

  const enriched = (properties ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    entry_code: p.entry_code,
    building_entry_code: p.building_entry_code,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Update Codes</h1>
        <p className="text-xs text-muted-foreground">
          Change apartment or building entry codes.
        </p>
      </div>
      <CodeUpdateForm properties={enriched} />
    </div>
  )
}
