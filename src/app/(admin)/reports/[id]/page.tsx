export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { ReportEditor } from '@/components/features/report-editor'

export default async function ReportDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const serviceClient = createServiceClient()

  const { data: report } = await serviceClient
    .from('owner_reports')
    .select('*, owners(full_name, email)')
    .eq('id', params.id)
    .single()

  if (!report) notFound()

  const owner = report.owners as { full_name: string; email: string } | null
  const statusMap: Record<string, string> = { draft: 'warning', approved: 'info', sent: 'safe' }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">
            {owner?.full_name} — Q{report.quarter} {report.year}
          </h1>
          <StatusBadge
            status={statusMap[report.status] || 'neutral'}
            label={report.status}
            size="sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">{owner?.email}</p>
      </div>

      <ReportEditor
        reportId={report.id}
        status={report.status}
        narrativeEn={report.edited_narrative_en || report.ai_narrative_en || ''}
        narrativeHe={report.edited_narrative_he || report.ai_narrative_he || ''}
      />
    </div>
  )
}
