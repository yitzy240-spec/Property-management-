export const dynamic = 'force-dynamic'

import { AlertTriangle, Check, X, FileDown } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatILS } from '@/lib/utils'
import { BillActions } from '@/components/features/bill-actions'

const billTypeLabels: Record<string, string> = {
  arnona: 'Arnona',
  iec: 'Electricity (IEC)',
  water: 'Water',
  vaad_bayit: "Va'ad Bayit",
  internet: 'Internet',
  gas: 'Gas',
  other: 'Other',
}

const statusColors: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  flagged: 'bg-red-100 text-red-800',
  rejected: 'bg-gray-100 text-gray-600',
}

export default async function BillsPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: bills } = await supabase
    .from('bills')
    .select('*, properties(name)')
    .order('created_at', { ascending: false })

  const pending = bills?.filter((b) => b.status === 'pending_review') ?? []
  const flagged = bills?.filter((b) => b.status === 'flagged') ?? []
  const approved = bills?.filter((b) => b.status === 'approved') ?? []

  function BillList({ items }: { items: typeof bills }) {
    if (!items || items.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No bills in this status
        </p>
      )
    }

    return (
      <div className="space-y-3">
        {items.map((bill) => (
          <Card key={bill.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      {billTypeLabels[bill.bill_type] || bill.bill_type}
                    </h3>
                    {bill.is_anomaly && (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <AlertTriangle className="h-3 w-3" />
                        High
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(bill.properties as { name: string } | null)?.name}
                    {bill.due_date && ` · Due ${bill.due_date}`}
                  </p>
                  {bill.anomaly_note && (
                    <p className="mt-1 text-xs text-destructive">{bill.anomaly_note}</p>
                  )}
                  {bill.billing_period_start && bill.billing_period_end && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Period: {bill.billing_period_start} → {bill.billing_period_end}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold font-mono">
                    {formatILS(bill.amount_agorot)}
                  </p>
                  <Badge className={`text-[10px] ${statusColors[bill.status]}`}>
                    {bill.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              {bill.status === 'pending_review' || bill.status === 'flagged' ? (
                <div className="mt-3">
                  <BillActions billId={bill.id} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bill Verification Queue</h1>
        <p className="text-sm text-muted-foreground">
          AI-parsed bills awaiting review. Approve to make visible to owners.
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="flagged">
            Flagged ({flagged.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approved.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <BillList items={pending} />
        </TabsContent>
        <TabsContent value="flagged" className="mt-4">
          <BillList items={flagged} />
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          <BillList items={approved} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
