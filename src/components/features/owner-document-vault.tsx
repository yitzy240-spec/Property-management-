'use client'

import { useState } from 'react'
import { Upload, FileText, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Document {
  id: string
  title: string
  category: string
  storage_path: string
  created_at: string
}

export function OwnerDocumentVault({ documents, propertyIds }: { documents: Document[]; propertyIds: string[] }) {
  const [uploading, setUploading] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!propertyIds[0]) { toast.error('No property found'); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('property_id', propertyIds[0])
      formData.append('title', file.name)
      formData.append('category', 'other')

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Upload failed')
      }

      toast.success('Document uploaded')
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
      {documents.length > 0 ? (
        <>
          {documents.map((doc, i) => (
            <div key={doc.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <p className="truncate text-xs text-muted-foreground capitalize">{doc.category.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/download?path=${encodeURIComponent(doc.storage_path)}`}
                  className="rounded-[var(--radius-badge)] bg-primary/10 p-1.5 text-primary hover:bg-primary/20"
                  download
                  aria-label={`Download ${doc.title}`}
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete "${doc.title}"?\n\nThis removes the file. Cannot be undone.`)) return
                    try {
                      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({}))
                        throw new Error(body.error || 'Delete failed')
                      }
                      toast.success('Deleted')
                      window.location.reload()
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Delete failed')
                    }
                  }}
                  className="rounded-[var(--radius-badge)] p-1.5 text-muted-foreground hover:bg-status-danger/10 hover:text-status-danger"
                  aria-label={`Delete ${doc.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <div className="border-t border-border px-4 py-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80">
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading...' : 'Upload Document'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            </label>
          </div>
        </>
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No documents yet.</p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-button)] bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20">
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading...' : 'Upload Document'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
          </label>
        </div>
      )}
    </div>
  )
}
