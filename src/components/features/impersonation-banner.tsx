import { Eye } from 'lucide-react'

/**
 * Sticky banner shown at the top of every owner portal page when an admin
 * is in "view as owner" mode. Uses Marcus Properties copper for brand match
 * and high contrast against the white owner-portal background.
 *
 * Server component — receives the owner name from the parent page.
 */
export function ImpersonationBanner({ ownerName }: { ownerName: string | null }) {
  return (
    <div
      className="sticky top-0 z-50 border-b border-[hsl(var(--brand-copper))]/40 bg-[hsl(var(--brand-copper))] px-4 py-2 text-white shadow-md"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="truncate text-xs font-medium">
            Viewing as <span className="font-semibold">{ownerName ?? 'Unknown owner'}</span>
            <span className="ml-2 hidden text-white/80 sm:inline">— read-only</span>
          </p>
        </div>
        <a
          href="/api/impersonate/exit?next=/dashboard"
          className="shrink-0 rounded-[var(--radius-button)] border border-white/40 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
        >
          Exit impersonation
        </a>
      </div>
    </div>
  )
}
