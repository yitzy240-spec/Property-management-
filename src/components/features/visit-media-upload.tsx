'use client'

import { useState, useRef } from 'react'
import { Camera, X, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeExtension } from '@/lib/storage'
import { toast } from 'sonner'

interface MediaFile {
  id: string
  file: File
  preview: string
  isPrivate: boolean
  fileType: 'image' | 'video'
}

interface VisitMediaUploadProps {
  onFilesChange: (files: MediaFile[]) => void
  files: MediaFile[]
}

export type { MediaFile }

export function VisitMediaUpload({ files, onFilesChange }: VisitMediaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    const newFiles: MediaFile[] = selected.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      isPrivate: false,
      fileType: file.type.startsWith('video/') ? 'video' : 'image',
    }))
    onFilesChange([...files, ...newFiles])
    if (inputRef.current) inputRef.current.value = ''
  }

  function togglePrivate(id: string) {
    onFilesChange(files.map(f => f.id === id ? { ...f, isPrivate: !f.isPrivate } : f))
  }

  function removeFile(id: string) {
    const file = files.find(f => f.id === id)
    if (file) URL.revokeObjectURL(file.preview)
    onFilesChange(files.filter(f => f.id !== id))
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border-2 border-dashed border-border bg-card px-4 py-6 text-center transition-colors hover:border-accent"
      >
        <Camera className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Tap to add photos or videos</p>
        <p className="text-[11px] text-muted-foreground/70">Each can be marked private</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map(f => (
            <div key={f.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted">
              {f.fileType === 'image' ? (
                <img src={f.preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">VID</div>
              )}
              {f.isPrivate && (
                <div className="absolute left-0 top-0 rounded-br bg-primary px-1 py-0.5">
                  <Lock className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className="absolute right-0 top-0 rounded-bl bg-black/50 p-0.5"
              >
                <X className="h-3 w-3 text-white" />
              </button>
              <button
                type="button"
                onClick={() => togglePrivate(f.id)}
                className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5 text-center text-[9px] font-medium text-white"
              >
                {f.isPrivate ? 'Private' : 'Public'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export async function uploadVisitMedia(
  propertyId: string,
  visitId: string,
  files: MediaFile[]
): Promise<{ file_path: string; file_type: string; is_private: boolean }[]> {
  const supabase = createClient()
  const results: { file_path: string; file_type: string; is_private: boolean }[] = []

  for (const f of files) {
    // Sanitize the extension — Supabase Storage rejects non-ASCII keys, and
    // a Hebrew/spaced filename would break this. sanitizeExtension returns
    // 'bin' on miss; for media we prefer 'mp4'/'jpg' based on the kind.
    const sanitized = sanitizeExtension(f.file.name)
    const ext = sanitized === 'bin' ? (f.fileType === 'video' ? 'mp4' : 'jpg') : sanitized
    const path = `${propertyId}/${visitId}/${f.id}.${ext}`

    const { error } = await supabase.storage
      .from('visit-media')
      .upload(path, f.file, { contentType: f.file.type })

    if (error) {
      toast.error(`Failed to upload ${f.file.name}`)
      continue
    }

    results.push({
      file_path: path,
      file_type: f.fileType,
      is_private: f.isPrivate,
    })
  }

  return results
}
