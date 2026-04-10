export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { signOut } from '@/app/login/actions'
import { MessageThread } from '@/components/features/message-thread'
import { RequestStay } from '@/components/features/request-stay'
import { InvoiceHistory } from '@/components/features/invoice-history'

export default async function OwnerPortalPage() {
  const supabase = createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: owner } = await supabase
    .from('owners')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!owner) {
    // If user is an admin, redirect to dashboard instead of showing error
    const isAdmin = user.app_metadata?.role === 'admin' || user.email === process.env.ADMIN_EMAIL
    if (isAdmin) redirect('/dashboard')

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] p-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Account Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No owner profile is linked to this account. Contact your property manager.
          </p>
        </div>
      </div>
    )
  }

  const { data: properties } = await supabase
    .from('properties')
    .select('*')
    .eq('owner_id', owner.id)
    .eq('is_active', true)

  const propertyIds = properties?.map(p => p.id) ?? []

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
    propertyIds.length > 0
      ? supabase.from('task_media').select('*, tasks(title, is_cleaning, property_id, properties(name))').eq('uploaded_by', 'contractor').order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
  ])

  const stagingPhotos = ((taskMedia as unknown[]) ?? []).filter((m: any) =>
    m.tasks?.is_cleaning && propertyIds.includes(m.tasks?.property_id)
  )

  const showFinancials = owner.profile === 'investor' || owner.profile === 'hybrid'
  const showBookings = owner.profile === 'investor' || owner.profile === 'hybrid'
  const showMaintenance = owner.profile === 'hybrid' || owner.profile === 'private'

  const totalBills = (bills ?? []).reduce((s, b) => s + b.amount_agorot, 0)

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-[#FAFAFA]">
      {/* Header — sticky for scroll context */}
      <div className="sticky top-0 z-30 border-b border-border bg-card px-4 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" className="h-5 w-auto" />
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Marcus Properties</p>
            </div>
            <h1 className="mt-0.5 text-lg font-semibold">{owner.full_name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              status={owner.profile === 'investor' ? 'info' : owner.profile === 'hybrid' ? 'warning' : 'safe'}
              label={owner.profile}
              size="sm"
            />
            <form action={signOut}>
              <button type="submit" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                Sign Out
              </button>
            </form>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {properties?.length ?? 0} {(properties?.length ?? 0) === 1 ? 'property' : 'properties'}
        </p>
      </div>

      <div className="space-y-6 p-4">
        {/* Properties */}
        {properties && properties.length > 0 && (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {properties.map((property, i) => (
              <div key={property.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                <h3 className="text-sm font-semibold">{property.name}</h3>
                <p className="text-xs text-muted-foreground">{property.address}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {property.num_bedrooms} bed · {property.neighborhood || property.city}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Financials */}
        {showFinancials && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Financials</p>
            <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Properties</p>
                  <p className="font-mono text-lg font-bold">{properties?.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recent Bills</p>
                  <CurrencyDisplay agorot={totalBills} variant="expense" className="text-lg font-bold" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bookings</p>
                  <p className="font-mono text-lg font-bold">{bookings?.length ?? 0}</p>
                </div>
              </div>
            </div>

            {bills && bills.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent Bills</p>
                </div>
                {bills.slice(0, 5).map((bill, i) => (
                  <div key={bill.id} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">{bill.bill_type.replace('_', ' ')}</span>
                      <span className="text-xs text-muted-foreground">
                        {(bill.properties as { name: string } | null)?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CurrencyDisplay agorot={bill.amount_agorot} className="text-sm font-semibold" />
                      {bill.pdf_storage_path && (
                        <a
                          href={`/api/download?path=${encodeURIComponent(bill.pdf_storage_path)}`}
                          className="rounded-[var(--radius-badge)] bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                          download
                        >
                          PDF
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Bookings */}
        {showBookings && bookings && bookings.length > 0 && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Upcoming Bookings</p>
            <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
              {bookings.map((booking, i) => (
                <div key={booking.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div>
                    <p className="text-sm font-medium">{booking.guest_name || 'Guest'}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {booking.check_in} → {booking.check_out}
                    </p>
                  </div>
                  {booking.platform && (
                    <StatusBadge status="neutral" label={booking.platform} size="sm" />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Maintenance */}
        {showMaintenance && tasks && tasks.length > 0 && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Maintenance Log</p>
            <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
              {tasks.map((task, i) => (
                <div key={task.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {(task.properties as { name: string } | null)?.name}
                    </p>
                  </div>
                  <StatusBadge status={task.status} size="sm" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Staging Gallery */}
        {stagingPhotos.length > 0 && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Peace of Mind Gallery</p>
            <p className="mb-2 text-xs text-muted-foreground">Photos from recent cleaning and staging visits</p>
            <div className="grid grid-cols-2 gap-2">
              {stagingPhotos.slice(0, 8).map((photo: any) => (
                <a
                  key={photo.id}
                  href={`/api/download?path=${encodeURIComponent(photo.storage_path)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-border bg-muted"
                >
                  {photo.media_type === 'video' ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Video · {(photo.tasks as any)?.properties?.name}
                    </div>
                  ) : (
                    <img
                      src={`/api/download?path=${encodeURIComponent(photo.storage_path)}`}
                      alt={`${(photo.tasks as any)?.properties?.name} — staging photo`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Invoices & Receipts from Green Invoice */}
        {showFinancials && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Invoices & Receipts</p>
            <InvoiceHistory clientFilter={owner.full_name} limit={10} showHeader={false} />
          </section>
        )}

        {/* Document Vault */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Document Vault</p>
          {documents && documents.length > 0 ? (
            <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
              {documents.map((doc, i) => (
                <div key={doc.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.category}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
              No documents uploaded yet.
            </div>
          )}
        </section>

        {/* Messages */}
        {properties && properties.length > 0 && (
          <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Messages</p>
            <p className="mb-3 text-xs text-muted-foreground">Send notes to your property manager</p>
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
          </section>
        )}

        {/* Request My Stay */}
        {properties && properties.length > 0 && (
          <div className="pb-6">
            <RequestStay properties={properties.map(p => ({ id: p.id, name: p.name }))} />
          </div>
        )}
      </div>
    </div>
  )
}
