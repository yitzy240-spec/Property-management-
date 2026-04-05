export const dynamic = 'force-dynamic'

import { DollarSign, FileText, TrendingUp } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatILS } from '@/lib/utils'

export default async function FinancialsPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // Get fee entries for current month
  const { data: feeEntries } = await supabase
    .from('fee_entries')
    .select('*, properties(name)')
    .eq('billing_month', currentMonth)
    .order('created_at', { ascending: false })

  // Totals by type
  const totals = (feeEntries ?? []).reduce(
    (acc, entry) => {
      acc[entry.fee_type] = (acc[entry.fee_type] || 0) + entry.amount_agorot
      acc.total += entry.amount_agorot
      return acc
    },
    { commission: 0, hourly: 0, fixed: 0, total: 0 } as Record<string, number>
  )

  // Get unpushed entries for invoice generation
  const unpushedCount = (feeEntries ?? []).filter((e) => !e.pushed_to_invoice).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financials</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        {unpushedCount > 0 && (
          <Button>
            <FileText className="mr-2 h-4 w-4" />
            Push to Green Invoice ({unpushedCount})
          </Button>
        )}
      </div>

      {/* Fee Summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Commission (20%)</p>
            <p className="text-xl font-bold font-mono text-green-700">
              {formatILS(totals.commission)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Hourly</p>
            <p className="text-xl font-bold font-mono">
              {formatILS(totals.hourly)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Fixed Fees</p>
            <p className="text-xl font-bold font-mono">
              {formatILS(totals.fixed)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Earnings</p>
            <p className="text-xl font-bold font-mono">
              {formatILS(totals.total)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Fee Entries List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fee Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {feeEntries && feeEntries.length > 0 ? (
            <div className="space-y-2">
              {feeEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {(entry.properties as { name: string } | null)?.name}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.fee_type}
                      </Badge>
                    </div>
                    {entry.description && (
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {entry.pushed_to_invoice ? (
                      <Badge variant="outline" className="text-[10px] text-green-700">
                        Invoiced
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Pending
                      </Badge>
                    )}
                    <p className="text-sm font-mono font-semibold">
                      {formatILS(entry.amount_agorot)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8">
              <TrendingUp className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                No fee entries for this month yet
              </p>
              <p className="text-xs text-muted-foreground">
                Fees are calculated from completed bookings and tasks
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
