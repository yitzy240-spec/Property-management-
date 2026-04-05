export const dynamic = 'force-dynamic'

import { FileText, Upload } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentUpload } from '@/components/features/document-upload'

const categoryLabels: Record<string, string> = {
  tabu: 'Tabu',
  insurance: 'Insurance',
  contract: 'Contract',
  warranty: 'Warranty',
  receipt: 'Receipt',
  other: 'Other',
}

export default async function VaultPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: documents } = await serviceClient
    .from('documents')
    .select('*, properties(name), owners(full_name)')
    .order('created_at', { ascending: false })

  // Group by category
  const grouped = (documents ?? []).reduce<Record<string, typeof documents>>((acc, doc) => {
    const cat = doc.category
    if (!acc[cat]) acc[cat] = []
    acc[cat]!.push(doc)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Vault</h1>
          <p className="text-sm text-muted-foreground">
            {documents?.length ?? 0} documents across all properties
          </p>
        </div>
        <DocumentUpload />
      </div>

      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped).map(([category, docs]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {categoryLabels[category] || category}
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {docs?.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {docs?.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {(doc.properties as { name: string } | null)?.name ||
                         (doc.owners as { full_name: string } | null)?.full_name || 'General'}
                        {doc.expiry_date && ` · Expires ${doc.expiry_date}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {doc.uploaded_by}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No documents yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload property documents like Tabu, insurance, and contracts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
