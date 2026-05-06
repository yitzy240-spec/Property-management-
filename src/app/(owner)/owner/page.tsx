export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { getEffectiveOwnerId } from '@/lib/impersonation'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { signOut } from '@/app/login/actions'
import { MessageThread } from '@/components/features/message-thread'
import { RequestStay } from '@/components/features/request-stay'
import { InvoiceHistory } from '@/components/features/invoice-history'
import { OwnerStatements } from '@/components/features/billing/owner-statements'
import { VisitList } from '@/components/features/visit-list'
import { OwnerDocumentVault } from '@/components/features/owner-document-vault'
import { ImpersonationBanner } from '@/components/features/impersonation-banner'

const BILLS_PAGE_SIZE = 10

export default async function OwnerPortalPage({
  searchParams,
}: {
  searchParams?: { bills_page?: string }
}) {
  const billsPage = Math.max(1, parseInt(searchParams?.bills_page ?? '1', 10) || 1)
  const billsOffset = (billsPage - 1) * BILLS_PAGE_SIZE
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()
  const cookieStore = cookies()

  // Resolve which owner_id to fetch data for. When the admin is impersonating,
  // this returns the impersonated owner's id (auth-verified). Otherwise it
  // returns the actual user's owner row id.
  const { ownerId, isImpersonating, impersonatedName, actualUser } = await getEffectiveOwnerId(
    supabase,
    serviceClient,
    cookieStore
  )

  if (!actualUser) redirect('/login')

  // Stale impersonation cookie → bounce admin back to dashboard so they can
  // re-pick. (The "Exit impersonation" link clears the cookie en route.)
  if (isImpersonating && !ownerId) {
    redirect('/api/impersonate/exit?next=/dashboard')
  }

  if (!ownerId) {
    // Real user has no owner record. If they're admin, send them to the
    // admin dashboard; otherwise show the not-found state.
    const isAdmin = actualUser.app_metadata?.role === 'admin' || actualUser.email === process.env.ADMIN_EMAIL
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

  // CRITICAL: When impersonating, the admin's auth session would scope RLS to
  // the admin user, NOT the impersonated owner. Use the service-role client
  // (which bypasses RLS) and explicitly filter by ownerId. Admin role was
  // already verified inside getEffectiveOwnerId before the cookie was honored.
  // For non-impersonated reads we keep using the auth client so RLS still
  // protects against any accidental over-fetch.
  const dataClient = isImpersonating ? serviceClient : supabase

  const { data: owner } = await dataClient
    .from('owners')
    .select('*')
    .eq('id', ownerId)
    .single()

  if (!owner) {
    // Edge case: ownerId resolved but row vanished between calls.
    if (isImpersonating) redirect('/api/impersonate/exit?next=/dashboard')
    redirect('/login')
  }

  const { data: properties } = await dataClient
    .from('properties')
    .select('*')
    .eq('owner_id', owner.id)
    .eq('is_active', true)

  const propertyIds = properties?.map(p => p.id) ?? []

  const [
    { data: bookings },
    billsResult,
    { data: tasks },
    { data: documents },
    { data: taskMedia },
    { data: ownerVisits },
  ] = await Promise.all([
    propertyIds.length > 0
      ? dataClient.from('bookings').select('*').in('property_id', propertyIds).gte('check_in', new Date().toISOString().split('T')[0]).eq('is_cancelled', false).order('check_in').limit(5)
      : Promise.resolve({ data: [] }),
    // Sort by due_date desc so the most-recent due date shows first;
    // null due_dates fall to the bottom. Paginate at 10 per page so
    // owners with long history can flip through, not just see the top
    // chunk.
    propertyIds.length > 0
      ? dataClient.from('bills').select('*, properties(name)', { count: 'exact' }).in('property_id', propertyIds).eq('status', 'approved').order('due_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).range(billsOffset, billsOffset + BILLS_PAGE_SIZE - 1)
      : Promise.resolve({ data: [], count: 0 }),
    propertyIds.length > 0
      ? dataClient.from('tasks').select('*, properties(name)').in('property_id', propertyIds).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? dataClient.from('documents').select('*').in('property_id', propertyIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? dataClient.from('task_media').select('*, tasks(title, is_cleaning, property_id, properties(name))').eq('uploaded_by', 'contractor').order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? dataClient.from('visits').select('id, property_id, visited_at, checklist, note, created_at, properties(name)').in('property_id', propertyIds).order('visited_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
  ])

  const bills = billsResult.data
  const billsTotal = (billsResult as { count?: number }).count ?? 0
  const billsTotalPages = Math.max(1, Math.ceil(billsTotal / BILLS_PAGE_SIZE))

  const stagingPhotos = ((taskMedia as unknown[]) ?? []).filter((m: any) =>
    m.tasks?.is_cleaning && propertyIds.includes(m.tasks?.property_id)
  )

  const showFinancials = owner.profile === 'investor' || owner.profile === 'hybrid'
  const showBookings = owner.profile === 'investor' || owner.profile === 'hybrid'
  const showMaintenance = owner.profile === 'hybrid' || owner.profile === 'private'

  // Calendar-year total. Computed across ALL approved bills for the
  // owner's properties this year — independent of bills_page so the
  // top-line number doesn't shift while the user paginates the list.
  // We can't filter by year on a single column at the DB level because
  // bills can have billing_period_start, due_date, or only created_at
  // — and we want whichever is the most accurate "this is when the
  // bill was for". Fetch all amount+date columns and bucket in JS.
  const currentYear = new Date().getFullYear()
  const { data: allYearBills } = propertyIds.length > 0
    ? await dataClient
        .from('bills')
        .select('amount_agorot, billing_period_start, due_date, created_at')
        .in('property_id', propertyIds)
        .eq('status', 'approved')
    : { data: [] }
  const totalBills = (allYearBills ?? []).reduce((s, b) => {
    const date = b.billing_period_start || b.due_date || b.created_at
    if (date && new Date(date as string).getFullYear() === currentYear) {
      return s + (b.amount_agorot ?? 0)
    }
    return s
  }, 0)

  // YTD booking income for owner's properties — mirrors how the admin
  // dashboard computes its YTD revenue. Lodgify-synced bookings carry
  // a non-null gross_rental_agorot; airbnb/admin-entered ones may not.
  const ytdStart = `${currentYear}-01-01`
  const ytdEnd = `${currentYear}-12-31`
  const { data: ytdBookingsRaw } = propertyIds.length > 0
    ? await dataClient
        .from('bookings')
        .select('gross_rental_agorot')
        .in('property_id', propertyIds)
        .gte('check_in', ytdStart)
        .lte('check_in', ytdEnd)
        .not('gross_rental_agorot', 'is', null)
        .eq('is_cancelled', false)
    : { data: [] }
  const ytdBookingIncome = (ytdBookingsRaw ?? []).reduce(
    (s, b) => s + (b.gross_rental_agorot ?? 0),
    0,
  )

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-[#FAFAFA]">
      {isImpersonating && <ImpersonationBanner ownerName={impersonatedName ?? owner.full_name} />}
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
            {!isImpersonating && (
              <form action={signOut}>
                <button type="submit" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  Sign Out
                </button>
              </form>
            )}
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

        {/* Request My Stay — prominent at top (read-only while impersonating) */}
        {properties && properties.length > 0 && !isImpersonating && (
          <RequestStay properties={properties.map(p => ({ id: p.id, name: p.name }))} />
        )}

        {/* Recent Visits */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Recent Visits ({(ownerVisits as unknown[])?.length ?? 0})
          </p>
          <VisitList
            visits={((ownerVisits as Array<Record<string, unknown>>) ?? []).map(v => ({
              id: v.id as string,
              property_id: v.property_id as string,
              visited_at: v.visited_at as string,
              checklist: (v.checklist as Record<string, boolean>) ?? {},
              note: v.note as string | null,
              created_at: v.created_at as string,
              properties: v.properties as { name: string } | null,
            }))}
            showPropertyName
          />
        </section>

        {/* Monthly Statements — visible to ALL profiles (if charges exist, owners need to see them) */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Monthly Statements</p>
          <OwnerStatements ownerId={owner.id} />
        </section>

        {/* Financials */}
        {showFinancials && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Financials</p>
            <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{currentYear} Income</p>
                  <CurrencyDisplay agorot={ytdBookingIncome} variant="income" className="text-lg font-bold" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{currentYear} Bills</p>
                  <CurrencyDisplay agorot={totalBills} variant="expense" className="text-lg font-bold" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Properties</p>
                  <p className="font-mono text-lg font-bold">{properties?.length ?? 0}</p>
                </div>
              </div>
            </div>

            {bills && bills.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent Bills</p>
                </div>
                {bills.map((bill, i) => {
                  const typeLabels: Record<string, string> = {
                    iec: 'Electricity',
                    water: 'Water',
                    gas: 'Gas',
                    internet: 'Internet',
                    arnona: 'Arnona',
                    vaad_bayit: "Va'ad Bayit",
                    other: 'Other',
                  }
                  const billDate = bill.billing_period_end || bill.due_date || bill.created_at?.split('T')[0]
                  return (
                    <div key={bill.id} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{typeLabels[bill.bill_type] || bill.bill_type}</span>
                          <span className="text-xs text-muted-foreground">
                            {(bill.properties as { name: string } | null)?.name}
                          </span>
                        </div>
                        {billDate && (
                          <p className="text-xs text-muted-foreground">{billDate}</p>
                        )}
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
                  )
                })}
              </div>
            )}

            {billsTotalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs">
                {billsPage > 1 ? (
                  <a
                    href={`/owner?bills_page=${billsPage - 1}`}
                    className="rounded-[var(--radius-button)] border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted"
                  >
                    ← Previous
                  </a>
                ) : (
                  <span />
                )}
                <p className="text-muted-foreground">Page {billsPage} of {billsTotalPages}</p>
                {billsPage < billsTotalPages ? (
                  <a
                    href={`/owner?bills_page=${billsPage + 1}`}
                    className="rounded-[var(--radius-button)] border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted"
                  >
                    Next →
                  </a>
                ) : (
                  <span />
                )}
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

        {/* Document Vault — hidden while impersonating (uploads are mutations) */}
        {!isImpersonating && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Document Vault</p>
            <OwnerDocumentVault
              documents={(documents ?? []).map(d => ({ id: d.id, title: d.title, category: d.category, storage_path: d.storage_path, created_at: d.created_at }))}
              propertyIds={propertyIds}
            />
          </section>
        )}

        {/* Messages — read-only while impersonating */}
        {properties && properties.length > 0 && !isImpersonating && (
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

        <div className="pb-6" />
      </div>
    </div>
  )
}
