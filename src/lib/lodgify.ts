import { createServiceClient } from '@/lib/supabase/server'

const LODGIFY_BASE = 'https://api.lodgify.com'
const PAGE_SIZE = 50

// ── Types ──

interface LodgifyGuest {
  name: string
  email?: string
  phone?: string
}

interface LodgifyBooking {
  id: string
  status: string
  property_id: number
  arrival: string
  departure: string
  guest: LodgifyGuest | null
  total_amount: number
  currency: string
  source: string | null
  rooms: { room_type_id: number }[] | null
  quote_details?: {
    total: number
    subtotal: number
    taxes: number
    fees: number
  } | null
  transactions?: {
    amount: number
    date: string
    type: string
  }[] | null
}

export interface LodgifyPropertyFull {
  id: number
  name: string
  description: string
  status: string
  address: string
  city: string
  country: string
  latitude: number
  longitude: number
  image_url: string
  currency_code: string
  rooms: { id: number; name: string }[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LodgifyAvailabilityPeriod {
  start: string
  end: string
  available: boolean
  min_stay?: number
  max_stay?: number
}

export interface LodgifyRateDay {
  date: string
  rate: number
  min_stay?: number
  available: boolean
}

interface LodgifyPaginatedResponse<T> {
  items: T[]
  count?: number
}

// ── API Client ──

export function getApiKey(): string {
  const key = process.env.LODGIFY_API_KEY
  if (!key) {
    throw new Error('Lodgify API key not configured. Set LODGIFY_API_KEY in environment variables.')
  }
  return key
}

async function lodgifyFetch<T>(
  path: string,
  apiKey: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const url = `${LODGIFY_BASE}${path}`

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'X-ApiKey': apiKey,
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000
    await new Promise(resolve => setTimeout(resolve, waitMs))
    return lodgifyFetch<T>(path, apiKey, options)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Lodgify API ${response.status}: ${body.slice(0, 200)}`)
  }

  // Some endpoints return 204 No Content
  if (response.status === 204) return {} as T

  return response.json()
}

// ══════════════════════════════════════
// BOOKINGS
// ══════════════════════════════════════

async function fetchAllBookings(apiKey: string): Promise<LodgifyBooking[]> {
  const allBookings: LodgifyBooking[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const params = new URLSearchParams({
      page: String(page),
      size: String(PAGE_SIZE),
      includeQuoteDetails: 'true',
      includeTransactions: 'true',
      includeExternal: 'true',
      includeCount: 'true',
      stayFilter: 'All',
      trash: 'False',
    })

    const data = await lodgifyFetch<LodgifyPaginatedResponse<LodgifyBooking>>(
      `/v2/reservations/bookings?${params}`,
      apiKey
    )

    allBookings.push(...(data.items || []))
    const total = data.count ?? 0
    hasMore = allBookings.length < total && (data.items || []).length === PAGE_SIZE
    page++
  }

  return allBookings
}

/** Mark a booking as checked in */
export async function checkinBooking(bookingId: string): Promise<void> {
  const apiKey = getApiKey()
  await lodgifyFetch(`/v2/reservations/bookings/${bookingId}/checkin`, apiKey, { method: 'PUT' })
}

/** Mark a booking as checked out */
export async function checkoutBooking(bookingId: string): Promise<void> {
  const apiKey = getApiKey()
  await lodgifyFetch(`/v2/reservations/bookings/${bookingId}/checkout`, apiKey, { method: 'PUT' })
}

/** Push key codes to a booking in Lodgify */
export async function pushKeyCodes(bookingId: string, keyCodes: string[]): Promise<void> {
  const apiKey = getApiKey()
  await lodgifyFetch(`/v2/reservations/bookings/${bookingId}/keyCodes`, apiKey, {
    method: 'PUT',
    body: { keyCodes },
  })
}

// ══════════════════════════════════════
// PROPERTIES
// ══════════════════════════════════════

export async function fetchLodgifyProperties(apiKey: string): Promise<LodgifyPropertyFull[]> {
  const data = await lodgifyFetch<{ items?: LodgifyPropertyFull[] } | LodgifyPropertyFull[]>('/v2/properties', apiKey)
  if (Array.isArray(data)) return data
  return data.items || []
}

/** Get full property details including photos, amenities, rooms */
export async function fetchPropertyDetail(propertyId: number): Promise<LodgifyPropertyFull> {
  const apiKey = getApiKey()
  return lodgifyFetch<LodgifyPropertyFull>(`/v2/properties/${propertyId}`, apiKey)
}

// ══════════════════════════════════════
// AVAILABILITY
// ══════════════════════════════════════

/** Get availability periods for a property */
export async function fetchAvailability(
  propertyId: number,
  start: string,
  end: string
): Promise<LodgifyAvailabilityPeriod[]> {
  const apiKey = getApiKey()
  const params = new URLSearchParams({ start, end, includeDetails: 'true' })
  return lodgifyFetch<LodgifyAvailabilityPeriod[]>(
    `/v2/availability/${propertyId}?${params}`,
    apiKey
  )
}

/** Block or unblock dates for a property */
export async function blockDates(
  propertyId: number,
  from: string,
  to: string,
  available: boolean
): Promise<void> {
  const apiKey = getApiKey()
  await lodgifyFetch(`/v2/properties/${propertyId}/availability`, apiKey, {
    method: 'PUT',
    body: { from, to, available },
  })
}

// ══════════════════════════════════════
// RATES
// ══════════════════════════════════════

/** Get daily rates calendar for a property's room type */
export async function fetchRatesCalendar(
  propertyId: number,
  roomTypeId: number,
  from: string,
  to: string,
  currency: string = 'USD'
): Promise<LodgifyRateDay[]> {
  const apiKey = getApiKey()
  const params = new URLSearchParams({
    RoomTypeId: String(roomTypeId),
    HouseId: String(propertyId),
    from, to, currency,
  })
  return lodgifyFetch<LodgifyRateDay[]>(`/v2/rates/calendar?${params}`, apiKey)
}

// ══════════════════════════════════════
// WEBHOOKS
// ══════════════════════════════════════

export type LodgifyWebhookEvent =
  | 'booking_new_any_status'
  | 'booking_new_status_booked'
  | 'booking_change'
  | 'booking_status_change_booked'
  | 'booking_status_change_tentative'
  | 'booking_status_change_open'
  | 'booking_status_change_declined'
  | 'rate_change'
  | 'availability_change'
  | 'guest_message_received'

interface LodgifyWebhookSubscription {
  id: string
  event: string
  target_url: string
  secret_key: string
  status: string
}

/** Subscribe to a Lodgify webhook event */
export async function subscribeWebhook(
  targetUrl: string,
  event: LodgifyWebhookEvent
): Promise<LodgifyWebhookSubscription> {
  const apiKey = getApiKey()
  return lodgifyFetch<LodgifyWebhookSubscription>('/webhooks/v1/subscribe', apiKey, {
    method: 'POST',
    body: { target_url: targetUrl, event },
  })
}

/** List all webhook subscriptions */
export async function listWebhooks(): Promise<LodgifyWebhookSubscription[]> {
  const apiKey = getApiKey()
  return lodgifyFetch<LodgifyWebhookSubscription[]>('/webhooks/v1/list', apiKey)
}

/** Unsubscribe from a webhook */
export async function unsubscribeWebhook(webhookId: string): Promise<void> {
  const apiKey = getApiKey()
  await lodgifyFetch(`/webhooks/v1/${webhookId}`, apiKey, { method: 'DELETE' })
}

// ══════════════════════════════════════
// QUOTES
// ══════════════════════════════════════

export interface LodgifyQuote {
  total: number
  subtotal: number
  currency: string
  nights: number
  breakdown: {
    accommodation: number
    taxes: number
    fees: number
  }
}

/** Generate a pricing quote for a property */
export async function generateQuote(
  propertyId: number,
  from: string,
  to: string,
  adults: number = 2
): Promise<LodgifyQuote> {
  const apiKey = getApiKey()
  const params = new URLSearchParams({
    from, to,
    'guest_breakdown[adults]': String(adults),
    includeBreakdown: 'true',
  })
  return lodgifyFetch<LodgifyQuote>(`/v2/quote/${propertyId}?${params}`, apiKey)
}

// ══════════════════════════════════════
// SYNC ENGINE
// ══════════════════════════════════════

interface SyncResult {
  synced: number
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export async function syncLodgifyBookings(): Promise<SyncResult> {
  const apiKey = getApiKey()
  const supabase = createServiceClient()
  const result: SyncResult = { synced: 0, created: 0, updated: 0, skipped: 0, errors: [] }

  const { data: properties } = await supabase
    .from('properties')
    .select('id, lodgify_property_id, commission_rate')
    .not('lodgify_property_id', 'is', null)
    .eq('is_active', true)

  if (!properties || properties.length === 0) {
    result.errors.push('No properties with Lodgify IDs configured')
    return result
  }

  const propertyMap = new Map(
    properties.map(p => [p.lodgify_property_id, { id: p.id, commissionRate: Number(p.commission_rate) }])
  )

  let lodgifyBookings: LodgifyBooking[]
  try {
    lodgifyBookings = await fetchAllBookings(apiKey)
  } catch (err) {
    result.errors.push(`Failed to fetch Lodgify bookings: ${err instanceof Error ? err.message : 'Unknown'}`)
    return result
  }

  // Track which Lodgify booking IDs we saw this run so we can mark
  // anything we DIDN'T see as cancelled (Lodgify drops cancelled
  // bookings from the list response, mirroring Airbnb's silent-removal
  // pattern). Also track which we positively confirmed as cancelled
  // by status, so the reconcile step doesn't double-count them.
  const seenLodgifyIds = new Set<string>()

  for (const lb of lodgifyBookings) {
    seenLodgifyIds.add(`lodgify_${lb.id}`)

    const property = propertyMap.get(String(lb.property_id))
    const platform = mapSourceToPlatform(lb.source)
    const guestNameRaw = lb.guest?.name || ''

    // Status-based cancel: Lodgify says it's cancelled / declined.
    // Update our DB row to reflect that instead of skipping silently.
    const status = (lb.status || '').toLowerCase()
    const isCancelledByStatus =
      status === 'declined' || status === 'cancelled' || status === 'canceled'
    // Airbnb-flavoured cancel: name is wiped after cancellation, but
    // Lodgify may still echo the row back without flipping its status.
    const isCancelledByAirbnbName =
      platform === 'airbnb' && (!guestNameRaw || guestNameRaw === 'N/A' || guestNameRaw.toLowerCase().includes('n/a'))

    if (isCancelledByStatus || isCancelledByAirbnbName) {
      // If we already have a row, soft-cancel it. If we don't, skip
      // entirely — no point inserting a cancelled record.
      if (property) {
        await supabase
          .from('bookings')
          .update({ is_cancelled: true, cancelled_at: new Date().toISOString() })
          .eq('property_id', property.id)
          .eq('external_id', `lodgify_${lb.id}`)
      }
      result.skipped++
      continue
    }

    // Tentative / inquiry / open are not bookings yet — skip without
    // touching the DB.
    if (status === 'tentative' || status === 'inquiry' || status === 'open') {
      result.skipped++
      continue
    }

    if (!property) {
      result.skipped++
      continue
    }
    // Lodgify total_amount is in the property's currency (USD for these Jerusalem properties)
    // Store as cents (multiply by 100) in gross_rental_agorot field
    // NOTE: These are USD cents, not ILS agorot — currency field tracks this
    const grossRentalAgorot = lb.total_amount ? Math.round(lb.total_amount * 100) : null
    const channelFeesAgorot = grossRentalAgorot ? estimateChannelFees(grossRentalAgorot, platform) : null
    const currency = lb.currency || 'USD'

    try {
      // Check if this exact Lodgify booking already exists
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('property_id', property.id)
        .eq('external_id', `lodgify_${lb.id}`)
        .single()

      const guestName = lb.guest?.name || null

      const bookingData = {
        property_id: property.id,
        platform,
        external_id: `lodgify_${lb.id}`,
        guest_name: guestName,
        check_in: lb.arrival,
        check_out: lb.departure,
        gross_rental_agorot: grossRentalAgorot,
        channel_fees_agorot: channelFeesAgorot,
        currency,
        synced_at: new Date().toISOString(),
        // Always clear cancellation flag for active bookings — handles
        // reactivation if a previously-cancelled booking is reinstated.
        is_cancelled: false,
        cancelled_at: null,
      }

      if (existing) {
        await supabase.from('bookings').update(bookingData).eq('id', existing.id)
        result.updated++
      } else {
        // Before inserting, check for an existing booking on the same dates
        // (may have been created from iCal sync or manual entry with a real guest name)
        const { data: dateMatch } = await supabase
          .from('bookings')
          .select('id, guest_name')
          .eq('property_id', property.id)
          .eq('check_in', lb.arrival)
          .eq('check_out', lb.departure)
          .limit(1)
          .single()

        if (dateMatch) {
          // Update existing booking with Lodgify financial data but keep real guest name
          const updateData: Record<string, unknown> = {
            external_id: `lodgify_${lb.id}`,
            gross_rental_agorot: grossRentalAgorot,
            channel_fees_agorot: channelFeesAgorot,
            currency,
            platform: platform || dateMatch.guest_name ? undefined : platform,
            synced_at: new Date().toISOString(),
          }
          // Only overwrite guest_name if the existing one is null/empty
          if (!dateMatch.guest_name && guestName) {
            updateData.guest_name = guestName
          }
          await supabase.from('bookings').update(updateData).eq('id', dateMatch.id)
          result.updated++
        } else {
          await supabase.from('bookings').insert(bookingData)
          result.created++
        }
      }
      result.synced++
    } catch (err) {
      result.errors.push(`Booking ${lb.id}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  // Reconcile silent removals: anything in our DB with a lodgify_*
  // external_id that we DIDN'T see in this pull is presumed cancelled.
  // Lodgify drops cancelled bookings from its list response, mirroring
  // Airbnb's silent-removal pattern. Only run when the fetch actually
  // succeeded (we'd have early-returned on failure above), so a transient
  // API error can't wipe out the booking list.
  if (seenLodgifyIds.size > 0) {
    const seenList = Array.from(seenLodgifyIds)
    const { data: missingRows } = await supabase
      .from('bookings')
      .select('id')
      .like('external_id', 'lodgify_%')
      .eq('is_cancelled', false)
      .not('external_id', 'in', `(${seenList.map(id => `"${id}"`).join(',')})`)

    if (missingRows && missingRows.length > 0) {
      await supabase
        .from('bookings')
        .update({ is_cancelled: true, cancelled_at: new Date().toISOString() })
        .in('id', missingRows.map(r => r.id))
    }
  }

  return result
}

// ── Helpers ──

function mapSourceToPlatform(source: string | null): string {
  if (!source) return 'direct'
  const s = source.toLowerCase()
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('booking.com') || s.includes('booking')) return 'booking_com'
  if (s.includes('vrbo') || s.includes('homeaway')) return 'vrbo'
  if (s.includes('expedia')) return 'expedia'
  if (s.includes('direct') || s.includes('website')) return 'direct'
  if (s.includes('manual')) return 'direct'
  return 'other'
}

/**
 * Channel fee rates by platform. The booking row stores
 * gross_rental_agorot as what the guest paid the platform; the
 * platform takes its cut before settling with the host. Subtracting
 * channel_fees_agorot from gross_rental_agorot gives the host's
 * actual receipt — which is what every revenue / commission /
 * statement number should be based on.
 *
 * Per Ariel: Airbnb's host service fee + payment processing eats
 * roughly 15% of the gross. Direct bookings have no platform cut.
 */
const CHANNEL_FEE_RATES: Record<string, number> = {
  airbnb: 0.15,
  booking_com: 0.15,
  vrbo: 0.05,
  expedia: 0.15,
  direct: 0,
  other: 0,
}

export function channelFeeRate(platform: string): number {
  return CHANNEL_FEE_RATES[platform] ?? 0
}

function estimateChannelFees(grossAgorot: number, platform: string): number {
  return Math.round(grossAgorot * channelFeeRate(platform))
}
