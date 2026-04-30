/**
 * Replays the exact queries the /properties/[id] page runs against prod
 * and reports what fails. Run with:
 *   npx tsx --env-file=.env.local scripts/debug-property-page.ts
 */

import { createClient } from '@supabase/supabase-js'

const PROPERTY_ID = process.argv[2] || 'dace8043-80ad-4e9d-a530-7e3c3ba0efec' // Jerusalem Skyline

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

async function step(name: string, fn: () => Promise<unknown>) {
  process.stdout.write(`${name.padEnd(28)} → `)
  try {
    const result = await fn()
    const r = result as { data?: unknown; error?: { message?: string; code?: string; details?: string } | null }
    if (r?.error) {
      console.log('ERROR')
      console.log('  message:', r.error.message)
      console.log('  code:', r.error.code)
      console.log('  details:', r.error.details)
      return r.error
    }
    const d = r?.data as unknown
    if (Array.isArray(d)) console.log(`OK (${d.length} rows)`)
    else if (d) console.log('OK (1 row)')
    else console.log('OK (no data)')
    return null
  } catch (err) {
    const e = err as Error
    console.log('THREW')
    console.log('  type:', e.name)
    console.log('  message:', e.message)
    console.log('  stack:', e.stack?.split('\n').slice(0, 3).join('\n  '))
    return e
  }
}

async function dump(name: string, fn: () => Promise<unknown>) {
  console.log(`\n=== ${name} ===`)
  const r = (await fn()) as { data?: unknown; error?: unknown }
  if (r.error) {
    console.log('ERROR:', r.error)
    return
  }
  console.log(JSON.stringify(r.data, null, 2).slice(0, 4000))
}

async function main() {
  console.log(`Running property-page queries against ${url}`)
  console.log(`Property: ${PROPERTY_ID}\n`)

  await dump('property', () =>
    supabase.from('properties')
      .select('*, owners(full_name, email, profile)')
      .eq('id', PROPERTY_ID)
      .single()
  )

  await dump('bills', () =>
    supabase.from('bills').select('*')
      .eq('property_id', PROPERTY_ID)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(10)
  )

  await dump('bookings', () =>
    supabase.from('bookings').select('*')
      .eq('property_id', PROPERTY_ID)
      .gte('check_out', new Date().toISOString().split('T')[0])
      .order('check_in', { ascending: true })
      .limit(20)
  )

  await dump('visits', () =>
    supabase.from('visits').select('*')
      .eq('property_id', PROPERTY_ID)
      .order('visited_at', { ascending: false })
      .limit(5)
  )

  await step('properties.select(*, owners)', () =>
    supabase.from('properties')
      .select('*, owners(full_name, email, profile)')
      .eq('id', PROPERTY_ID)
      .single()
  )

  await step('bookings.select(*)', () =>
    supabase.from('bookings').select('*')
      .eq('property_id', PROPERTY_ID)
      .gte('check_out', new Date().toISOString().split('T')[0])
      .order('check_in', { ascending: true })
      .limit(20)
  )

  await step('bills.select(*) +neq rejected', () =>
    supabase.from('bills').select('*')
      .eq('property_id', PROPERTY_ID)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(10)
  )

  await step('tasks.select(*, contractors)', () =>
    supabase.from('tasks').select('*, contractors(name)')
      .eq('property_id', PROPERTY_ID)
      .order('created_at', { ascending: false })
      .limit(10)
  )

  await step('documents.select(*)', () =>
    supabase.from('documents').select('*')
      .eq('property_id', PROPERTY_ID)
      .order('created_at', { ascending: false })
  )

  await step('visits.select(*)', () =>
    supabase.from('visits').select('*')
      .eq('property_id', PROPERTY_ID)
      .order('visited_at', { ascending: false })
      .limit(5)
  )

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Script crashed:', err)
  process.exit(1)
})
