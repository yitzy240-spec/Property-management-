export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PropertyForm } from '@/components/features/property-form'

export default async function EditPropertyPage({
  params,
}: {
  params: { id: string }
}) {
  const serviceClient = createServiceClient()

  const { data: property } = await serviceClient
    .from('properties')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!property) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/properties/${params.id}`}>
          <button className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Edit {property.name}</h1>
          <p className="text-xs text-muted-foreground">Update property details and integrations.</p>
        </div>
      </div>
      <PropertyForm property={property} />
    </div>
  )
}
