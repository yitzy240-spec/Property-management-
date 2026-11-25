'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Edit, Image as ImageIcon, Upload, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { VISIT_CHECKLIST_ITEMS, type ChecklistKey } from '@/types'

interface VisitDetailDrawerProps {
  visitId: string
  trigger: React.ReactNode
  isOwner?: boolean
}

interface VisitDetail {
  id: string
  property_id: string
  visited_at: string
  checklist: Partial<Record<ChecklistKey, boolean>>
  note: string | null
  admin_note: string | null
  created_by: string
  created_at: string
  properties: { name: string }
  media: Array<{
    id: string
    file_path: string
    file_type: 'image' | 'video'
    is_private: boolean
    signed_url: string | null
  }>
  can_edit: boolean
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

export function VisitDetailDrawer({ visitId, trigger, isOwner = false }: VisitDetailDrawerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedChecklist, setEditedChecklist] = useState<Partial<Record<ChecklistKey, boolean>>>({})
  const [editedNote, setEditedNote] = useState('')
  const [editedAdminNote, setEditedAdminNote] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    
    async function fetchVisit() {
      setLoading(true)
      setError(null)
      setIsEditing(false)
      try {
        const res = await fetch(`/api/visits/${visitId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to load visit')
        }
        const data = await res.json()
        setVisit(data.visit)
        setEditedChecklist(data.visit.checklist)
        setEditedNote(data.visit.note || '')
        setEditedAdminNote(data.visit.admin_note || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load visit')
      } finally {
        setLoading(false)
      }
    }
    
    fetchVisit()
  }, [open, visitId])

  async function handleSave() {
    if (!visit) return
    setSaving(true)
    try {
      const res = await fetch(`/api/visits/${visitId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: editedChecklist,
          note: editedNote || null,
          admin_note: editedAdminNote || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save changes')
      }

      toast.success('Visit updated')
      setIsEditing(false)
      
      // Refresh visit data
      const refreshRes = await fetch(`/api/visits/${visitId}`)
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setVisit(data.visit)
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadMedia() {
    if (!fileInputRef.current?.files?.[0]) return
    
    const file = fileInputRef.current.files[0]
    const formData = new FormData()
    formData.append('file', file)
    formData.append('is_private', 'false')

    setSaving(true)
    try {
      const res = await fetch(`/api/visits/${visitId}/media`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to upload media')
      }

      toast.success('Media uploaded')
      
      // Refresh visit data
      const refreshRes = await fetch(`/api/visits/${visitId}`)
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setVisit(data.visit)
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteMedia(mediaId: string) {
    if (!confirm('Delete this media?')) return

    setSaving(true)
    try {
      const res = await fetch(`/api/visits/${visitId}/media?mediaId=${mediaId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete media')
      }

      toast.success('Media deleted')
      
      // Refresh visit data
      const refreshRes = await fetch(`/api/visits/${visitId}`)
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setVisit(data.visit)
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteVisit() {
    if (!confirm('Delete this entire visit? This will permanently delete the visit and all its photos/videos.')) return

    setSaving(true)
    try {
      const res = await fetch(`/api/visits/${visitId}/delete`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete visit')
      }

      toast.success('Visit deleted')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete visit')
    } finally {
      setSaving(false)
    }
  }

  const checkedItems = VISIT_CHECKLIST_ITEMS.filter(
    item => visit?.checklist[item.key]
  )
  const uncheckedItems = VISIT_CHECKLIST_ITEMS.filter(
    item => !visit?.checklist[item.key]
  )

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Visit Details</DrawerTitle>
          <DrawerDescription>
            {visit ? `${visit.properties.name} · ${formatDate(visit.visited_at)}` : 'Loading...'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[70vh] overflow-y-auto px-4 pb-4">
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading visit...</p>
          )}

          {error && (
            <div className="rounded-[10px] border border-status-danger bg-status-danger/5 p-4 text-sm text-status-danger">
              <AlertCircle className="mr-2 inline h-4 w-4" />
              {error}
            </div>
          )}

          {visit && (
            <div className="space-y-4">
              {/* Checklist */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Checklist ({isEditing ? Object.values(editedChecklist).filter(Boolean).length : checkedItems.length}/{VISIT_CHECKLIST_ITEMS.length})
                </p>
                {isEditing ? (
                  <div className="space-y-1">
                    {VISIT_CHECKLIST_ITEMS.map(item => (
                      <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editedChecklist[item.key] || false}
                          onChange={(e) => setEditedChecklist({ ...editedChecklist, [item.key]: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {checkedItems.map(item => (
                      <div key={item.key} className="flex items-center gap-2 text-sm">
                        <span className="text-status-safe">✓</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                    {uncheckedItems.map(item => (
                      <div key={item.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>○</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Note */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Note
                </p>
                {isEditing ? (
                  <textarea
                    value={editedNote}
                    onChange={(e) => setEditedNote(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Add a note..."
                  />
                ) : visit.note ? (
                  <p className="text-sm">{visit.note}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No note</p>
                )}
              </div>

              {/* Admin Note (admin only) */}
              {!isOwner && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Admin Note
                  </p>
                  {isEditing ? (
                    <textarea
                      value={editedAdminNote}
                      onChange={(e) => setEditedAdminNote(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Add admin note..."
                    />
                  ) : visit.admin_note ? (
                    <p className="text-sm text-accent">📌 {visit.admin_note}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No admin note</p>
                  )}
                </div>
              )}

              {/* Media */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Photos & Videos ({visit.media.length})
                </p>
                {visit.media.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {visit.media.map(media => (
                      <div key={media.id} className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-border bg-muted group">
                        {media.signed_url ? (
                          media.file_type === 'video' ? (
                            <video
                              src={media.signed_url}
                              controls
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <a
                              href={media.signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block h-full w-full"
                            >
                              <img
                                src={media.signed_url}
                                alt="Visit photo"
                                className="h-full w-full object-cover transition-opacity hover:opacity-90"
                                loading="lazy"
                              />
                            </a>
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                        {isEditing && (
                          <button
                            onClick={() => handleDeleteMedia(media.id)}
                            disabled={saving}
                            className="absolute right-1 top-1 rounded-md bg-status-danger/90 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No media</p>
                )}
                
                {/* Upload media when editing */}
                {isEditing && (
                  <div className="mt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleUploadMedia}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Add Photo/Video
                    </Button>
                  </div>
                )}
              </div>

              {/* Edit/Save/Delete buttons (admin or within 24h creator) */}
              {visit.can_edit && !isOwner && (
                <div className="border-t border-border pt-4 space-y-2">
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setIsEditing(false)
                          setEditedChecklist(visit.checklist)
                          setEditedNote(visit.note || '')
                          setEditedAdminNote(visit.admin_note || '')
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => setIsEditing(true)}
                      >
                        <Edit className="mr-1.5 h-3.5 w-3.5" />
                        Edit Visit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-status-danger text-status-danger hover:bg-status-danger/5"
                        onClick={handleDeleteVisit}
                        disabled={saving}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete Visit
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
