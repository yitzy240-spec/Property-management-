export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { OwnerInviteButton } from '@/components/features/owner-invite-button'

export default async function OwnersPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: owners } = await serviceClient
    .from('owners')
    .select('*, properties(id, name)')
    .order('full_name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Owners</h1>
          <p className="text-xs text-muted-foreground">
            {owners?.length ?? 0} owners
          </p>
        </div>
        <Link href="/owners/new">
          <Button size="sm" className="h-9 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </Link>
      </div>

      {owners && owners.length > 0 ? (
        <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
          {owners.map((owner, i) => {
            const properties = owner.properties as { id: string; name: string }[] | null
            const profileStatus = owner.profile === 'investor' ? 'info' : owner.profile === 'hybrid' ? 'warning' : 'safe'
            const hasAuth = !!owner.auth_user_id
            return (
              <div key={owner.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{owner.full_name}</h3>
                      <StatusBadge status={profileStatus} label={owner.profile} size="sm" />
                      {hasAuth ? (
                        <StatusBadge status="safe" label="Portal active" size="sm" />
                      ) : (
                        <StatusBadge status="neutral" label="No access" size="sm" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{owner.email}</p>
                    {properties && properties.length > 0 && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {properties.map(p => p.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <OwnerInviteButton
                      ownerId={owner.id}
                      ownerName={owner.full_name.split(' ')[0]}
                      hasAuth={hasAuth}
                    />
                    {owner.phone && (
                      <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{owner.phone}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-12 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No owners yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add your first property owner.</p>
          <Link href="/owners/new" className="mt-4 inline-block">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Owner
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
