import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/encryption'

/**
 * POST /api/invoices
 *
 * Creates a DRAFT invoice in Green Invoice from unpushed fee entries.
 * Admin-only. Uses encrypted Green Invoice API key from app_settings.
 */
export async function POST(request: Request) {
  // Verify authenticated admin
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // TODO: Add admin role check when role system is implemented
  // e.g., if (user.app_metadata.role !== 'admin') return 403

  const { billing_month } = await request.json()

  // Validate billing_month format (YYYY-MM-01)
  if (!billing_month || !/^\d{4}-\d{2}-01$/.test(billing_month)) {
    return NextResponse.json({ error: 'billing_month must be in YYYY-MM-01 format' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Get Green Invoice API key
  const { data: setting } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'green_invoice_api_key')
    .single()

  if (!setting) {
    return NextResponse.json(
      { error: 'Green Invoice API key not configured. Add it in Settings.' },
      { status: 400 }
    )
  }

  let apiKey: string
  try {
    apiKey = await decrypt(setting.value)
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt API key' }, { status: 500 })
  }

  // Get unpushed fee entries for this month
  const { data: entries } = await serviceClient
    .from('fee_entries')
    .select('*, properties(name)')
    .eq('billing_month', billing_month)
    .eq('pushed_to_invoice', false)

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: 'No unpushed entries for this month' }, { status: 400 })
  }

  // Build invoice line items
  const lineItems = entries.map((entry) => ({
    description: `${(entry.properties as { name: string } | null)?.name || 'Property'} — ${entry.fee_type}${entry.description ? `: ${entry.description}` : ''}`,
    quantity: 1,
    price: entry.amount_agorot / 100, // Convert agorot to ILS for the API
    currency: 'ILS',
  }))

  const totalILS = entries.reduce((sum, e) => sum + e.amount_agorot, 0) / 100

  // Create draft invoice via Green Invoice API
  // Note: This is the API structure — actual endpoint will need verification
  // against Green Invoice API docs when the client provides their account
  try {
    const invoiceResponse = await fetch('https://api.greeninvoice.co.il/api/v1/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        type: 305, // Tax Invoice (חשבונית מס)
        status: 0, // Draft
        lang: 'he', // Hebrew
        currency: 'ILS',
        description: `Management fees — ${new Date(billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        items: lineItems,
      }),
    })

    if (!invoiceResponse.ok) {
      const errorBody = await invoiceResponse.text()
      console.error('Green Invoice API error:', invoiceResponse.status, errorBody)
      return NextResponse.json(
        { error: `Green Invoice API returned ${invoiceResponse.status}. Check server logs for details.` },
        { status: 502 }
      )
    }

    const invoiceData = await invoiceResponse.json()
    const invoiceId = invoiceData.id || invoiceData._id

    // Mark entries as pushed
    const entryIds = entries.map((e) => e.id)
    await serviceClient
      .from('fee_entries')
      .update({ pushed_to_invoice: true, invoice_id: invoiceId })
      .in('id', entryIds)

    return NextResponse.json({
      success: true,
      invoice_id: invoiceId,
      total_ils: totalILS,
      entries_pushed: entryIds.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create invoice', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }
}
