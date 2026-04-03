export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatILS } from '@/lib/utils'
import { signOut } from '@/app/login/actions'
import { MessageThread } from '@/components/features/message-thread'

export default async function OwnerPortalPage() {
  const supabase = createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get owner record
  const { data: owner } = await supabase
    .from('owners')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!owner) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold">Account Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No owner profile is linked to this account. Contact your property manager.
          </p>
        </div>
      </div>
    )
  }

  // Get owner's properties with related data
  const { data: properties } = await supabase
    .from('properties')
    .select('*')
    .eq('owner_id', owner.id)
    .eq('is_active', true)

  const propertyIds = properties?.map(p => p.id) ?? []

  // Parallel fetches
  const [
    { data: bookings },
    { data: bills },
    { data: tasks },
    { data: documents },
    { data: taskMedia },
  ] = await Promise.all([
    propertyIds.length > 0
      ? supabase.from('bookings').select('*').in('property_id', propertyIds).gte('check_in', new Date().toISOString().split('T')[0]).order('check_in').limit(5)
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? supabase.from('bills').select('*, properties(name)').in('property_id', propertyIds).eq('status', 'approved').order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? supabase.from('tasks').select('*, properties(name)').in('property_id', propertyIds).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? supabase.from('documents').select('*').in('property_id', propertyIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    // Staging photos — cleaning verification media
    propertyIds.length > 0
      ? supabase.from('task_media').select('*, tasks(title, is_cleaning, property_id, properties(name))').eq('uploaded_by', 'contractor').order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
  ])

  // Filter staging photos to only show cleaning task photos for this owner's properties
  const stagingPhotos = ((taskMedia as unknown[]) ?? []).filter((m: any) =>
    m.tasks?.is_cleaning && propertyIds.includes(m.tasks?.property_id)
  )

  const showFinancials = owner.profile === 'investor' || owner.profile === 'hybrid'
  const showBookings = owner.profile === 'investor' || owner.profile === 'hybrid'
  const showMaintenance = owner.profile === 'hybrid' || owner.profile === 'private'
  const showVault = true // All profiles see vault

  // Calculate financials
  const totalBills = (bills ?? []).reduce((s, b) => s + b.amount_agorot, 0)

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-background">
      {/* Header */}
      <div className="border-b bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Marcus Properties</p>
            <h1 className="text-xl font-bold">{owner.full_name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{owner.profile}</Badge>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">Sign Out</Button>
            </form>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {properties?.length ?? 0} {(properties?.length ?? 0) === 1 ? 'property' : 'properties'}
        </p>
      </div>

      <div className="space-y-6 p-4">
        {/* Properties Overview */}
        {properties && properties.length > 0 && (
          <div className="space-y-3">
            {properties.map((property) => (
              <Card key={property.id}>
                <CardContent className="p-4">
                  <h3 className="font-semibold">{property.name}</h3>
                  <p className="text-sm text-muted-foreground">{property.address}</p>
                  <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                    <span>{property.num_bedrooms} bed</span>
                    <span>·</span>
                    <span>{property.neighborhood || property.city}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Financials — Investor + Hybrid */}
        {showFinancials && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-bold">Financials</h2>
              <Card className="mt-3">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Bills (YTD)</p>
                      <p className="text-lg font-bold font-mono text-destructive">
                        {formatILS(totalBills)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Properties</p>
                      <p className="text-lg font-bold font-mono">
                        {properties?.length ?? 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Bills */}
              {bills && bills.length > 0 && (
                <Card className="mt-3">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recent Bills</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {bills.slice(0, 5).map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium capitalize">{bill.bill_type.replace('_', ' ')}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {(bill.properties as { name: string } | null)?.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono">{formatILS(bill.amount_agorot)}</span>
                          {bill.pdf_storage_path && (
                            <a
                              href={`/api/download?path=${encodeURIComponent(bill.pdf_storage_path)}`}
                              className="text-xs text-primary hover:underline"
                            >
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Bookings — Investor + Hybrid */}
        {showBookings && bookings && bookings.length > 0 && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-bold">Upcoming Bookings</h2>
              <div className="mt-3 space-y-2">
                {bookings.map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{booking.guest_name || 'Guest'}</p>
                        <p className="text-xs text-muted-foreground">
                          {booking.check_in} → {booking.check_out}
                        </p>
                      </div>
                      {booking.platform && (
                        <Badge variant="secondary" className="text-[10px]">{booking.platform}</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Maintenance — Hybrid + Private */}
        {showMaintenance && tasks && tasks.length > 0 && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-bold">Maintenance Log</h2>
              <div className="mt-3 space-y-2">
                {tasks.map((task) => (
                  <Card key={task.id}>
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {(task.properties as { name: string } | null)?.name}
                        </p>
                      </div>
                      <Badge
                        variant={task.status === 'completed' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {task.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Staging Gallery — "Peace of Mind" photos from cleaners */}
        {stagingPhotos.length > 0 && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-bold">Peace of Mind Gallery</h2>
              <p className="text-xs text-muted-foreground">Photos from recent cleaning and staging visits</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {stagingPhotos.slice(0, 8).map((photo: any) => (
                  <a
                    key={photo.id}
                    href={`/api/download?path=${encodeURIComponent(photo.storage_path)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
                  >
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {photo.media_type === 'video' ? '🎥' : '📷'} {(photo.tasks as any)?.properties?.name}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Document Vault — All profiles */}
        {showVault && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-bold">Document Vault</h2>
              {documents && documents.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {documents.map((doc) => (
                    <Card key={doc.id}>
                      <CardContent className="flex items-center justify-between p-3">
                        <div>
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">{doc.category}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No documents uploaded yet.</p>
              )}
            </div>
          </>
        )}

        {/* Messages — All profiles */}
        {properties && properties.length > 0 && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-bold">Messages</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Send notes to your property manager
              </p>
              <div className="space-y-4">
                {properties.map((property) => (
                  <MessageThread
                    key={property.id}
                    propertyId={property.id}
                    propertyName={property.name}
                    currentRole="owner"
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Request My Stay — All profiles */}
        <Separator />
        <div className="pb-6">
          <Button variant="outline" className="w-full">
            Request My Stay
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Block dates for your personal stay. Your manager will be notified.
          </p>
        </div>
      </div>
    </div>
  )
}
