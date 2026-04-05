export const dynamic = 'force-dynamic'

import { FileText } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
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
          <h1 className="text-lg font-semibold tracking-tight">Document Vault</h1>
          <p className="text-xs text-muted-foreground">
            {documents?.length ?? 0} documents
          </p>
        </div>
        <DocumentUpload />
      </div>

      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped).map(([category, docs]) => (
          <section key={category}>
            <div className="mb-3 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {categoryLabels[category] || category}
              </p>
              <span className="font-mono text-xs text-muted-foreground">{docs?.length}</span>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
              {docs?.map((doc, i) => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    <div>
                      <p className="text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {(doc.properties as { name: string } | null)?.name ||
                         (doc.owners as { full_name: string } | null)?.full_name || 'General'}
                        {doc.expiry_date && ` · Expires ${doc.expiry_date}`}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{doc.uploaded_by}</span>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-12 text-center shadow-sm">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No documents yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload property documents like Tabu, insurance, and contracts.
          </p>
        </div>
      )}
    </div>
  )
}
