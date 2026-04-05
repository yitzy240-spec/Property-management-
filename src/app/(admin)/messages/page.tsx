export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { MessageThread } from '@/components/features/message-thread'

export default async function MessagesPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = createServiceClient()

  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name, owners(full_name)')
    .eq('is_active', true)
    .order('name')

  const { data: unreadCounts } = await serviceClient
    .from('messages')
    .select('property_id')
    .eq('is_read', false)
    .eq('sender_role', 'owner')

  const unreadMap: Record<string, number> = {}
  ;(unreadCounts ?? []).forEach((m) => {
    unreadMap[m.property_id] = (unreadMap[m.property_id] || 0) + 1
  })

  const sortedProperties = (properties ?? []).sort((a, b) => {
    const aUnread = unreadMap[a.id] || 0
    const bUnread = unreadMap[b.id] || 0
    return bUnread - aUnread
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
        <p className="text-xs text-muted-foreground">
          Conversations with property owners, organized by property.
        </p>
      </div>

      {sortedProperties.length > 0 ? (
        <div className="space-y-5">
          {sortedProperties.map((property) => {
            const unread = unreadMap[property.id] || 0
            const ownerName = (property.owners as unknown as { full_name: string } | null)?.full_name

            return (
              <section key={property.id}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-xs font-semibold">{property.name}</h3>
                  {ownerName && (
                    <span className="text-xs text-muted-foreground">— {ownerName}</span>
                  )}
                  {unread > 0 && (
                    <span className="rounded-full bg-status-danger px-1.5 py-0.5 text-xs font-medium text-white">
                      {unread}
                    </span>
                  )}
                </div>
                <MessageThread
                  propertyId={property.id}
                  propertyName={property.name}
                  currentRole="admin"
                />
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">
          No properties found.
        </div>
      )}
    </div>
  )
}
