/**
 * ApartmentOS Backfill Script
 * Run: node scripts/backfill.mjs
 *
 * 1. Checks auth users
 * 2. Links Lodgify properties to local properties
 * 3. Enriches properties with Lodgify data (photos, coords, description)
 * 4. Syncs all Lodgify bookings
 */

const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhYmVoZmhjbW5nbW1mb2prbmV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3MTc4MywiZXhwIjoyMDkwOTQ3NzgzfQ.k-OGe6UKjHVnhgmWbD31uNunsIxSfAGb9B4LjiAXDtI'
const SB_BASE = 'https://gabehfhcmngmmfojknez.supabase.co'
const LODGIFY_KEY = '6OouqtxtrGBUXSE1tDCMIqBOxNvyb2X/i3vzzEN9qa4Ejik1fPBUqA67Le+0DyT0'

async function sb(path, opts = {}) {
  const r = await fetch(SB_BASE + path, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  })
  return r
}

async function lodgify(path) {
  const r = await fetch('https://api.lodgify.com' + path, {
    headers: { 'X-ApiKey': LODGIFY_KEY, Accept: 'application/json' },
  })
  return r.json()
}

async function main() {
  // ── Step 1: Check auth ──
  console.log('=== STEP 1: Auth Users ===')
  const authRes = await fetch(SB_BASE + '/auth/v1/admin/users?page=1&per_page=50', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  })

  if (authRes.status === 500) {
    console.log('ERROR: Auth admin API returns 500.')
    console.log('Run this SQL in Supabase SQL Editor first:\n')
    console.log(`INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', u.id::text, now(), now(), now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);`)
    console.log('\nThen run this script again.')
    return
  }

  const authData = await authRes.json()
  console.log('Users:', authData.users?.length || 0)
  for (const u of authData.users || []) {
    console.log('  ' + u.email + ' | role: ' + (u.app_metadata?.role || 'NONE'))
  }

  // ── Step 2: Fetch Lodgify properties ──
  console.log('\n=== STEP 2: Lodgify Properties ===')
  const lodgifyData = await lodgify('/v2/properties')
  const lodgifyProps = lodgifyData.items || lodgifyData
  console.log('Found ' + lodgifyProps.length + ' Lodgify properties')
  for (const p of lodgifyProps) {
    console.log('  #' + p.id + ' ' + p.name + ' | ' + (p.address || p.city))
  }

  // ── Step 3: Get local properties ──
  console.log('\n=== STEP 3: Local Properties ===')
  const localRes = await sb('/rest/v1/properties?select=id,name,address,lodgify_property_id&order=name')
  const localProps = await localRes.json()
  console.log('Found ' + localProps.length + ' local properties')

  // ── Step 4: Auto-match ──
  console.log('\n=== STEP 4: Auto-Match & Link ===')
  for (const local of localProps) {
    if (local.lodgify_property_id) {
      console.log('  SKIP ' + local.name + ' (already linked #' + local.lodgify_property_id + ')')
      continue
    }

    const match = lodgifyProps.find(lp => {
      const ln = lp.name.toLowerCase()
      const lo = local.name.toLowerCase()
      // Match by shared words > 3 chars
      const lnWords = ln.split(/\s+/)
      const loWords = lo.split(/\s+/)
      return lnWords.some(w => w.length > 3 && lo.includes(w)) ||
        loWords.some(w => w.length > 3 && ln.includes(w))
    })

    if (match) {
      console.log('  MATCH ' + local.name + ' -> ' + match.name + ' (#' + match.id + ')')
      const upd = await sb('/rest/v1/properties?id=eq.' + local.id, {
        method: 'PATCH',
        body: JSON.stringify({ lodgify_property_id: String(match.id) }),
        headers: { Prefer: 'return=minimal' },
      })
      console.log('    Linked: ' + (upd.status === 204 ? 'OK' : 'FAIL ' + upd.status))
    } else {
      console.log('  NO MATCH: ' + local.name)
      console.log('    Lodgify options: ' + lodgifyProps.map(p => p.name).join(', '))
    }
  }

  // ── Step 5: Enrich from Lodgify ──
  console.log('\n=== STEP 5: Enrich Properties ===')
  // Re-fetch with updated links
  const updatedRes = await sb('/rest/v1/properties?select=id,name,lodgify_property_id&order=name')
  const updatedProps = await updatedRes.json()

  for (const local of updatedProps) {
    if (!local.lodgify_property_id) continue

    const lp = lodgifyProps.find(p => String(p.id) === local.lodgify_property_id)
    if (!lp) continue

    const enrichData = {
      lodgify_data: {
        description: lp.description || null,
        image_url: lp.image_url || null,
        latitude: lp.latitude || null,
        longitude: lp.longitude || null,
        currency_code: lp.currency_code || null,
        rooms: lp.rooms || null,
        min_price: lp.min_price || null,
        max_price: lp.max_price || null,
        original_min_price: lp.original_min_price || null,
        original_max_price: lp.original_max_price || null,
        updated_from_lodgify_at: new Date().toISOString(),
      },
    }

    const upd = await sb('/rest/v1/properties?id=eq.' + local.id, {
      method: 'PATCH',
      body: JSON.stringify(enrichData),
      headers: { Prefer: 'return=minimal' },
    })
    console.log('  ' + local.name + ': ' + (upd.status === 204 ? 'Enriched' : 'FAIL ' + upd.status))
  }

  // ── Step 6: Sync bookings ──
  console.log('\n=== STEP 6: Sync Bookings ===')
  let allBookings = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const data = await lodgify('/v2/reservations/bookings?page=' + page + '&size=50&includeQuoteDetails=true&includeExternal=true&includeCount=true&stayFilter=All&trash=False')
    const items = data.items || []
    allBookings.push(...items)
    hasMore = items.length === 50
    page++
  }
  console.log('Fetched ' + allBookings.length + ' Lodgify bookings')

  // Build property map
  const propMap = new Map()
  for (const p of updatedProps) {
    if (p.lodgify_property_id) propMap.set(p.lodgify_property_id, p.id)
  }

  let created = 0, updated = 0, skipped = 0

  for (const b of allBookings) {
    const localPropId = propMap.get(String(b.property_id))
    if (!localPropId) { skipped++; continue }

    const source = (b.source || '').toLowerCase()
    let platform = 'other'
    if (source.includes('airbnb')) platform = 'airbnb'
    else if (source.includes('booking')) platform = 'booking_com'
    else if (source.includes('vrbo')) platform = 'vrbo'
    else if (source.includes('direct') || source.includes('manual') || source.includes('website')) platform = 'direct'

    const grossAgorot = b.total_amount ? Math.round(b.total_amount * 100) : null

    const bookingData = {
      property_id: localPropId,
      platform,
      external_id: 'lodgify_' + b.id,
      guest_name: b.guest?.name || null,
      check_in: b.arrival,
      check_out: b.departure,
      gross_rental_agorot: grossAgorot,
      synced_at: new Date().toISOString(),
    }

    // Check if exists
    const exRes = await sb('/rest/v1/bookings?select=id&property_id=eq.' + localPropId + '&external_id=eq.lodgify_' + b.id)
    const existing = await exRes.json()

    if (existing.length > 0) {
      await sb('/rest/v1/bookings?id=eq.' + existing[0].id, {
        method: 'PATCH',
        body: JSON.stringify(bookingData),
        headers: { Prefer: 'return=minimal' },
      })
      updated++
    } else {
      await sb('/rest/v1/bookings', {
        method: 'POST',
        body: JSON.stringify(bookingData),
        headers: { Prefer: 'return=minimal' },
      })
      created++
    }
  }
  console.log('  Created: ' + created + ', Updated: ' + updated + ', Skipped: ' + skipped)

  // ── Summary ──
  console.log('\n=== BACKFILL COMPLETE ===')
  console.log('Things you need to provide manually (not in Lodgify):')
  console.log('  - YouTube tutorial URL per property')
  console.log('  - Canva guest guide URL per property')
  console.log('  - Entry codes per property (verify against Simplex locks)')
  console.log('  - Owner email addresses (currently have placeholder @example.com)')
}

main().catch(e => console.error('FATAL:', e.message))
