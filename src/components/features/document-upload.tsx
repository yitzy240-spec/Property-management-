'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'
import type { DocumentCategory } from '@/types'

export function DocumentUpload() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [category, setCategory] = useState<DocumentCategory>('other')
  const [title, setTitle] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/properties/list')
      .then(r => r.json())
      .then(data => setProperties(data.properties ?? []))
      .catch(() => {})
  }, [open])

  async function handleUpload(formData: FormData) {
    setLoading(true)

    const file = formData.get('file') as File
    const titleVal = formData.get('title') as string
    const propertyId = selectedPropertyId || null

    if (!file || !titleVal) {
      setLoading(false)
      return
    }

    // Upload file via API (uses service client for storage)
    const uploadForm = new FormData()
    uploadForm.append('file', file)
    uploadForm.append('title', titleVal)
    uploadForm.append('category', category)
    if (selectedPropertyId) uploadForm.append('property_id', selectedPropertyId)

    const uploadRes = await fetch('/api/documents/upload', { method: 'POST', body: uploadForm })
    if (!uploadRes.ok) {
      const data = await uploadRes.json()
      toast.error('Upload failed', { description: data.error })
      setLoading(false)
      return
    }
    const { storagePath: filePath } = await uploadRes.json()

    // AI classification
    let aiClassified = false
    let aiData = null
    try {
      setClassifying(true)
      const res = await fetch('/api/ai/classify-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: filePath, filename: file.name }),
      })
      if (res.ok) {
        aiData = await res.json()
        aiClassified = true
      }
    } catch {
      // AI failed silently — use manual values
    } finally {
      setClassifying(false)
    }

    // Insert document record via API
    await fetch('/api/documents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleVal,
        category: aiClassified && aiData?.category ? aiData.category : category,
        storage_path: filePath,
        file_size: file.size,
        uploaded_by: 'admin',
        property_id: propertyId,
        expiry_date: (aiClassified && aiData?.expiry_date) || formData.get('expiry_date') as string || null,
        ai_classified: aiClassified,
        ai_classification_data: aiData,
      }),
    })

    setOpen(false)
    setLoading(false)
    toast.success('Document uploaded')
    router.refresh()
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5 rounded-[var(--radius-button)] bg-accent text-accent-foreground hover:bg-accent/90">
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Upload Document</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          <form action={handleUpload} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document Title</Label>
              <Input id="title" name="title" placeholder="Insurance Policy 2026" required className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</Label>
              <NativeSelect
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                options={[
                  { value: 'tabu', label: 'Tabu' },
                  { value: 'insurance', label: 'Insurance' },
                  { value: 'contract', label: 'Contract' },
                  { value: 'warranty', label: 'Warranty' },
                  { value: 'receipt', label: 'Receipt' },
                  { value: 'other', label: 'Other' },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="file" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">File</Label>
              <Input id="file" name="file" type="file" required className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expiry_date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expiry Date</Label>
              <Input id="expiry_date" name="expiry_date" type="date" className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Property</Label>
              <NativeSelect
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                placeholder="General (optional)"
                options={properties.map(p => ({ value: p.id, label: p.name }))}
              />
            </div>

            <Button type="submit" className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {classifying ? 'AI Classifying...' : loading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
