'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import type { DocumentCategory } from '@/types'

export function DocumentUpload() {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<DocumentCategory>('other')

  async function handleUpload(formData: FormData) {
    setLoading(true)

    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const propertyId = formData.get('property_id') as string || null

    if (!file || !title) {
      setLoading(false)
      return
    }

    // Upload to Supabase Storage
    const filePath = `vault/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file)

    if (uploadError) {
      setLoading(false)
      return
    }

    // Create document record
    await supabase.from('documents').insert({
      title,
      category,
      storage_path: filePath,
      file_size: file.size,
      uploaded_by: 'admin',
      property_id: propertyId,
      expiry_date: formData.get('expiry_date') as string || null,
    })

    setOpen(false)
    setLoading(false)
    window.location.reload()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        <Upload className="h-4 w-4" />
        Upload
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <form action={handleUpload} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Document Title</Label>
            <Input id="title" name="title" placeholder="Insurance Policy 2026" required />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tabu">Tabu</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="warranty">Warranty</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <Input id="file" name="file" type="file" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiry_date">Expiry Date (optional)</Label>
            <Input id="expiry_date" name="expiry_date" type="date" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="property_id">Property (optional)</Label>
            <Input id="property_id" name="property_id" placeholder="Property UUID" />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
