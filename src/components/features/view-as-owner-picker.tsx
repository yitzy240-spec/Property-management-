'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

interface OwnerOption {
  id: string
  full_name: string
  email: string | null
  profile?: string | null
}

/**
 * Admin-side picker drawer that lets the property manager view the owner
 * portal as a specific owner. Fetches the owner list lazily when opened,
 * then POSTs to /api/impersonate/enter to set the cookie before navigating
 * to /owner.
 *
 * Rendered inside the admin shell only — the API endpoints verify admin
 * role server-side, so this trigger is harmless to non-admins (they'll
 * just get a 403 if they try).
 */
export function ViewAsOwnerPicker({ onSelected }: { onSelected?: () => void } = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [owners, setOwners] = useState<OwnerOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    if (!open || owners !== null) return
    let cancelled = false
    setLoading(true)
    fetch('/api/owners/list')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => {
        if (!cancelled) setOwners(data.owners ?? [])
      })
      .catch(() => {
        if (!cancelled) {
          setOwners([])
          toast.error('Failed to load owners')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, owners])

  const filtered = (owners ?? []).filter((o) => {
    if (!filter.trim()) return true
    const q = filter.trim().toLowerCase()
    return (
      o.full_name.toLowerCase().includes(q) ||
      (o.email ?? '').toLowerCase().includes(q)
    )
  })

  async function viewAs(owner: OwnerOption) {
    setSubmitting(owner.id)
    try {
      const res = await fetch('/api/impersonate/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: owner.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to enter impersonation')
      }
      setOpen(false)
      onSelected?.()
      router.push('/owner')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enter impersonation')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="View owner portal as a specific owner"
        >
          <Eye className="h-4 w-4 shrink-0" />
          View as Owner
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>View as Owner</DrawerTitle>
          <DrawerDescription>
            See the owner portal exactly as this owner sees it. Read-only — you stay
            logged in as admin.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex max-h-[70vh] flex-col gap-3 px-4 pb-4">
          <input
            type="search"
            placeholder="Search owners..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-10 w-full rounded-[var(--radius-button)] border border-input bg-background px-3 text-sm"
            autoFocus
          />
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading owners…</p>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {owners && owners.length === 0 ? 'No owners found.' : 'No owners match that search.'}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-[10px] border border-border bg-card">
                {filtered.map((owner) => (
                  <li key={owner.id}>
                    <button
                      type="button"
                      onClick={() => viewAs(owner)}
                      disabled={submitting !== null}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{owner.full_name}</p>
                        {owner.email && (
                          <p className="truncate text-xs text-muted-foreground">{owner.email}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-primary">
                        {submitting === owner.id ? 'Loading…' : 'View →'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DrawerClose asChild>
            <button
              type="button"
              className="h-10 rounded-[var(--radius-button)] border border-border bg-background text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
