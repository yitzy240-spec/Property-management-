export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { FileBarChart, ChevronRight } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { ReportGenerateButton } from '@/components/features/report-generate-button'

export default async function ReportsPage() {
  const serviceClient = createServiceClient()

  const { data: reports } = await serviceClient
    .from('owner_reports')
    .select('*, owners(full_name)')
    .order('created_at', { ascending: false })

  const { data: owners } = await serviceClient
    .from('owners')
    .select('id, full_name')
    .order('full_name')

  const currentYear = new Date().getFullYear()
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Owner Reports</h1>
          <p className="text-xs text-muted-foreground">
            AI-generated quarterly reports with approval flow
          </p>
        </div>
        <ReportGenerateButton
          owners={owners ?? []}
          defaultQuarter={currentQuarter}
          defaultYear={currentYear}
        />
      </div>

      {reports && reports.length > 0 ? (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          {reports.map((report, i) => {
            const statusMap: Record<string, string> = {
              draft: 'warning',
              approved: 'info',
              sent: 'safe',
            }
            return (
              <Link key={report.id} href={`/reports/${report.id}`} className="block">
                <div className={`flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-muted/40 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {(report.owners as { full_name: string } | null)?.full_name}
                      </h3>
                      <StatusBadge
                        status={statusMap[report.status] || 'neutral'}
                        label={report.status}
                        size="sm"
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Q{report.quarter} {report.year}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-12 text-center shadow-sm">
          <FileBarChart className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No reports yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate your first quarterly report for an owner above.
          </p>
        </div>
      )}
    </div>
  )
}
