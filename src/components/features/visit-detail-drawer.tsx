'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Edit, Image as ImageIcon, X } from 'lucide-react'
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

  useEffect(() => {
    if (!open) return
    
    async function fetchVisit() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/visits/${visitId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to load visit')
        }
        const data = await res.json()
        setVisit(data.visit)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load visit')
      } finally {
        setLoading(false)
      }
    }
    
    fetchVisit()
  }, [open, visitId])

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
                  Checklist ({checkedItems.length}/{VISIT_CHECKLIST_ITEMS.length})
                </p>
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
              </div>

              {/* Note */}
              {visit.note && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Note
                  </p>
                  <p className="text-sm">{visit.note}</p>
                </div>
              )}

              {/* Admin Note (admin only) */}
              {visit.admin_note && !isOwner && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Admin Note
                  </p>
                  <p className="text-sm text-accent">📌 {visit.admin_note}</p>
                </div>
              )}

              {/* Media */}
              {visit.media.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Photos & Videos ({visit.media.length})
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {visit.media.map(media => (
                      <div key={media.id} className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-border bg-muted">
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
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Edit button (if within 24h and not owner) */}
              {visit.can_edit && !isOwner && (
                <div className="border-t border-border pt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      // TODO: Implement edit functionality
                      toast.info('Edit functionality coming soon')
                    }}
                  >
                    <Edit className="mr-1.5 h-3.5 w-3.5" />
                    Edit Visit
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
