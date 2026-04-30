import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/debug/render-property/:id  (cron-secret only)
 *
 * Runs all the same data fetching the property page does AND tries to
 * coerce the data through the same shapes the page passes to its child
 * components. Returns a JSON report of every step. Used to pinpoint
 * production server-component render errors that Next.js sanitizes out
 * of error.tsx in production.
 *
 * TEMPORARY — remove after the property-page issue is identified.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report: Record<string, unknown> = { propertyId: params.id, steps: [] as unknown[] }
  const steps = report.steps as Array<{ name: string; ok: boolean; error?: string; sample?: unknown }>

  function tryStep<T>(name: string, fn: () => T): T | null {
    try {
      const r = fn()
      steps.push({ name, ok: true })
      return r
    } catch (err) {
      const e = err as Error
      steps.push({ name, ok: false, error: `${e.name}: ${e.message}` })
      return null
    }
  }

  async function tryAsync<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      const r = await fn()
      steps.push({ name, ok: true })
      return r
    } catch (err) {
      const e = err as Error
      steps.push({ name, ok: false, error: `${e.name}: ${e.message}` })
      return null
    }
  }

  const serviceClient = createServiceClient()

  const property = await tryAsync('fetch property', async () => {
    const { data, error } = await serviceClient
      .from('properties')
      .select('*, owners(full_name, email, profile)')
      .eq('id', params.id)
      .single()
    if (error) throw new Error(`property query: ${error.message}`)
    return data
  })

  if (!property) return NextResponse.json(report)

  const bookings = await tryAsync('fetch bookings', async () => {
    const { data, error } = await serviceClient.from('bookings').select('*')
      .eq('property_id', params.id)
      .gte('check_out', new Date().toISOString().split('T')[0])
      .order('check_in', { ascending: true }).limit(20)
    if (error) throw new Error(`bookings query: ${error.message}`)
    return data ?? []
  })

  const bills = await tryAsync('fetch bills (neq rejected)', async () => {
    const { data, error } = await serviceClient.from('bills').select('*')
      .eq('property_id', params.id)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false }).limit(10)
    if (error) throw new Error(`bills query: ${error.message}`)
    return data ?? []
  })

  await tryAsync('fetch tasks', async () => {
    const { data, error } = await serviceClient.from('tasks').select('*, contractors(name)')
      .eq('property_id', params.id)
      .order('created_at', { ascending: false }).limit(10)
    if (error) throw new Error(`tasks query: ${error.message}`)
    return data ?? []
  })

  await tryAsync('fetch documents', async () => {
    const { data, error } = await serviceClient.from('documents').select('*')
      .eq('property_id', params.id)
      .order('created_at', { ascending: false })
    if (error) throw new Error(`documents query: ${error.message}`)
    return data ?? []
  })

  const visits = await tryAsync('fetch visits', async () => {
    const { data, error } = await serviceClient.from('visits').select('*')
      .eq('property_id', params.id)
      .order('visited_at', { ascending: false }).limit(5)
    if (error) throw new Error(`visits query: ${error.message}`)
    return data ?? []
  })

  // Now mimic the JSX coercions the page does — these are where TypeError
  // is most likely to leak in production.
  tryStep('coerce bookings shape', () => {
    return (bookings ?? []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      guest_name: b.guest_name as string | null,
      check_in: b.check_in as string,
      check_out: b.check_out as string,
      platform: b.platform as string | null,
      gross_rental_agorot: b.gross_rental_agorot as number | null,
      currency: (b.currency as string) || 'ILS',
      commission_amount_agorot: b.commission_amount_agorot as number | null,
      commission_collected: (b.commission_collected as boolean) || false,
      payment_status: (b.payment_status as string) || 'pending',
      notes: b.notes as string | null,
    }))
  })

  tryStep('coerce visits shape', () => {
    return (visits ?? []).map((v: Record<string, unknown>) => ({
      id: v.id as string,
      property_id: v.property_id as string,
      visited_at: v.visited_at as string,
      checklist: (v.checklist as Record<string, boolean>) ?? {},
      note: v.note as string | null,
      created_at: v.created_at as string,
    }))
  })

  // formatDate on each visit — common throw site
  tryStep('formatDate on each visit', () => {
    for (const v of (visits ?? []) as Array<Record<string, unknown>>) {
      new Date(v.visited_at as string).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    }
  })

  // billTypeLabel on each bill — uses .replace which throws if billType is non-string
  tryStep('billTypeLabel on each bill', () => {
    const BILL_TYPE_LABELS: Record<string, string> = {
      arnona: 'Arnona', iec: 'Electricity (IEC)', water: 'Water', gas: 'Gas',
      internet: 'Internet', vaad_bayit: "Va'ad Bayit (HOA)", cleaning: 'Cleaning', other: 'Other',
    }
    for (const b of (bills ?? []) as Array<Record<string, unknown>>) {
      const t = b.bill_type
      if (!t) continue
      const _ = BILL_TYPE_LABELS[t as string] || (t as string).replace('_', ' ')
      void _
    }
  })

  // lodgify_data field access — page does `(property as Record<string, unknown>).image_url as string | null
  //   || (ld?.image_url ? `https:${ld.image_url}` : null)`
  tryStep('lodgify_data hero image coercion', () => {
    const ld = (property as Record<string, unknown>).lodgify_data as { image_url?: string; min_price?: number } | null
    const heroImage = (property as Record<string, unknown>).image_url as string | null
      || (ld?.image_url ? `https:${ld.image_url}` : null)
    void heroImage
    void ld?.min_price
  })

  // entry_code_updated_at formatting
  tryStep('formatDateJerusalem entry_code_updated_at', () => {
    const v = (property as Record<string, unknown>).entry_code_updated_at as string | null
    if (v) new Date(v).toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem' })
  })

  return NextResponse.json(report)
}
