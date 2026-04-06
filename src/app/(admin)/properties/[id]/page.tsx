export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Pencil } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { CurrencyDisplay } from '@/components/ui/currency-display'
import { formatILS, formatDateJerusalem } from '@/lib/utils'
import { MagicLinkGenerator } from '@/components/features/magic-link-generator'
import { BookingAddButton } from '@/components/features/booking-add'
import { TaskCreateDialog } from '@/components/features/task-create-dialog'
import { BillAddButton } from '@/components/features/bill-add'
import { LaundryPickupButton } from '@/components/features/laundry-pickup'
import { WorkLogButton, WorkLogList } from '@/components/features/work-log'
import { UtilityAccountsSection } from '@/components/features/utility-accounts'
import { BookingList } from '@/components/features/booking-list'

export default async function PropertyDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: property } = await serviceClient
    .from('properties')
    .select('*, owners(full_name, email, profile)')
    .eq('id', params.id)
    .single()

  if (!property) notFound()

  const [
    { data: bookings },
    { data: bills },
    { data: tasks },
    { data: documents },
  ] = await Promise.all([
    serviceClient.from('bookings').select('*').eq('property_id', params.id).order('check_in', { ascending: true }).limit(20),
    serviceClient.from('bills').select('*').eq('property_id', params.id).order('created_at', { ascending: false }).limit(10),
    serviceClient.from('tasks').select('*, contractors(name)').eq('property_id', params.id).order('created_at', { ascending: false }).limit(10),
    serviceClient.from('documents').select('*').eq('property_id', params.id).order('created_at', { ascending: false }),
  ])

  const owner = property.owners as { full_name: string; email: string; profile: string } | null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/properties" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{property.name}</h1>
            <p className="text-xs text-muted-foreground">{property.address}</p>
          </div>
        </div>
        <Link href={`/properties/${params.id}/edit`}>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Info chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[var(--radius-badge)] bg-muted px-2 py-1 text-xs font-medium">{property.num_bedrooms} bed · {property.num_beds} beds</span>
        <span className="rounded-[var(--radius-badge)] bg-muted px-2 py-1 text-xs font-medium">{property.neighborhood || property.city}</span>
        {owner && (
          <>
            <span className="max-w-[160px] truncate rounded-[var(--radius-badge)] border border-border px-2 py-1 text-xs font-medium">{owner.full_name}</span>
            <StatusBadge status={owner.profile === 'investor' ? 'info' : owner.profile === 'hybrid' ? 'warning' : 'safe'} label={owner.profile} size="sm" />
          </>
        )}
        <span className="rounded-[var(--radius-badge)] border border-border px-2 py-1 text-xs font-medium font-mono">{Math.round(property.commission_rate * 100)}% commission</span>
      </div>

      {/* Lodgify Hero Image + Pricing */}
      {(() => {
        const ld = property.lodgify_data as { image_url?: string; min_price?: number; max_price?: number; currency_code?: string; rooms?: { id: number; name: string }[] } | null
        if (!ld) return null
        return (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {ld.image_url && (
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                <img
                  src={`https:${ld.image_url}`}
                  alt={property.name}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  {ld.min_price != null && (
                    <>
                      <p className="text-[10px] text-muted-foreground">Nightly rate</p>
                      <p className="font-mono text-lg font-bold">
                        {Math.round(ld.min_price)}
                        {ld.max_price && ld.max_price !== ld.min_price ? ` – ${Math.round(ld.max_price)}` : ''}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">{ld.currency_code || 'USD'}/nt</span>
                      </p>
                    </>
                  )}
                </div>
                {ld.rooms && (
                  <span className="text-xs text-muted-foreground">
                    {ld.rooms.length} room type{ld.rooms.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Entry Code */}
      {property.entry_code && (
        <div className="rounded-[10px] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Entry Code</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-wider">{property.entry_code}</p>
              {property.entry_code_updated_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {formatDateJerusalem(property.entry_code_updated_at)}
                </p>
              )}
            </div>
            {property.youtube_tutorial_url && (
              <a href={property.youtube_tutorial_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <ExternalLink className="h-3 w-3" />
                  Tutorial
                </Button>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Utility Accounts */}
      <UtilityAccountsSection propertyId={params.id} />

      {/* Bookings */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Bookings ({bookings?.length ?? 0})
          </p>
          <BookingAddButton propertyId={params.id} propertyName={property.name} />
        </div>
        {bookings && bookings.length > 0 ? (
          <BookingList
            bookings={(bookings as Array<Record<string, unknown>>).map(b => ({
              id: b.id as string,
              guest_name: b.guest_name as string | null,
              check_in: b.check_in as string,
              check_out: b.check_out as string,
              platform: b.platform as string | null,
              gross_rental_agorot: b.gross_rental_agorot as number | null,
              currency: (b.currency as string) || 'ILS',
              original_amount_cents: b.original_amount_cents as number | null,
              commission_amount_agorot: b.commission_amount_agorot as number | null,
              commission_collected: (b.commission_collected as boolean) || false,
              deposit_amount_agorot: b.deposit_amount_agorot as number | null,
              payment_status: (b.payment_status as string) || 'pending',
              notes: b.notes as string | null,
            }))}
            commissionRate={property.commission_rate}
          />
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">No bookings yet</div>
        )}
      </section>

      {/* Bills */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Bills ({bills?.length ?? 0})
          </p>
          <BillAddButton preselectedPropertyId={params.id} />
        </div>
        {bills && bills.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {bills.map((bill, i) => (
              <div key={bill.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                <div>
                  <p className="text-sm font-medium capitalize">{bill.bill_type.replace('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {bill.due_date ? `Due ${bill.due_date}` : 'No due date'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={bill.status} size="sm" />
                  <CurrencyDisplay agorot={bill.amount_agorot} className="text-sm font-semibold" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">No bills yet</div>
        )}
      </section>

      {/* Tasks */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Tasks ({tasks?.length ?? 0})
          </p>
          <TaskCreateDialog preselectedPropertyId={params.id} preselectedPropertyName={property.name} />
        </div>
        {tasks && tasks.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {tasks.map((task, i) => (
              <div key={task.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(task.contractors as { name: string } | null)?.name || 'Unassigned'}
                    {task.due_date && ` · Due ${task.due_date}`}
                  </p>
                </div>
                <StatusBadge status={task.status} size="sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">No tasks yet</div>
        )}
      </section>

      {/* Documents */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Vault ({documents?.length ?? 0})
        </p>
        {documents && documents.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {documents.map((doc, i) => (
              <div key={doc.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                <div>
                  <p className="text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{doc.category}</p>
                </div>
                <span className="text-xs text-muted-foreground">{doc.uploaded_by}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-8 text-center text-sm text-muted-foreground shadow-sm">No documents yet</div>
        )}
      </section>

      {/* Work Log */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Work Log
          </p>
          <WorkLogButton preselectedPropertyId={params.id} />
        </div>
        <WorkLogList propertyId={params.id} />
      </section>

      {/* Quick Actions */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Quick Actions
        </p>
        <div className="flex flex-wrap gap-2">
          <MagicLinkGenerator propertyId={params.id} propertyName={property.name} />
          <LaundryPickupButton
            properties={[{ id: params.id, name: property.name, address: property.address }]}
            lowStockItems={[]}
          />
        </div>
      </section>
    </div>
  )
}
