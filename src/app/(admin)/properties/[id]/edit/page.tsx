export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PropertyForm } from '@/components/features/property-form'
import { listUserLabelNames } from '@/lib/gmail'
import { GMAIL_LABEL_MAPPING_KEY, labelsForProperty, parseLabelMapping } from '@/lib/gmail-label-mapping'

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

  const [{ data: labelSetting }, gmailLabelOptions] = await Promise.all([
    serviceClient.from('app_settings').select('value').eq('key', GMAIL_LABEL_MAPPING_KEY).maybeSingle(),
    listUserLabelNames(),
  ])
  const gmailLabels = labelsForProperty(parseLabelMapping(labelSetting?.value), params.id)

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
      <PropertyForm property={property} gmailLabels={gmailLabels} gmailLabelOptions={gmailLabelOptions} />
    </div>
  )
}
