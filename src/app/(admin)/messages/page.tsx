export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageThread } from '@/components/features/message-thread'

export default async function MessagesPage() {
  // Verify admin is authenticated (route protected by middleware)
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Service client for property list — admin doesn't own properties, so RLS blocks them
  // This is acceptable because the (admin) route group requires authentication via middleware
  const serviceClient = createServiceClient()

  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name, owners(full_name)')
    .eq('is_active', true)
    .order('name')

  // Get unread counts per property
  const { data: unreadCounts } = await serviceClient
    .from('messages')
    .select('property_id')
    .eq('is_read', false)
    .eq('sender_role', 'owner')

  const unreadMap: Record<string, number> = {}
  ;(unreadCounts ?? []).forEach((m) => {
    unreadMap[m.property_id] = (unreadMap[m.property_id] || 0) + 1
  })

  // Sort properties with unread messages first
  const sortedProperties = (properties ?? []).sort((a, b) => {
    const aUnread = unreadMap[a.id] || 0
    const bUnread = unreadMap[b.id] || 0
    return bUnread - aUnread
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Conversations with property owners, organized by property.
        </p>
      </div>

      {sortedProperties.length > 0 ? (
        <div className="space-y-4">
          {sortedProperties.map((property) => {
            const unread = unreadMap[property.id] || 0
            const ownerName = (property.owners as unknown as { full_name: string } | null)?.full_name

            return (
              <div key={property.id}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{property.name}</h3>
                  {ownerName && (
                    <span className="text-xs text-muted-foreground">— {ownerName}</span>
                  )}
                  {unread > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {unread} new
                    </Badge>
                  )}
                </div>
                <MessageThread
                  propertyId={property.id}
                  propertyName={property.name}
                  currentRole="admin"
                />
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No properties found.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
