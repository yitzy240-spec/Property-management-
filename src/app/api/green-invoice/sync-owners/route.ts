import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { syncOwnerAsClient } from '@/lib/green-invoice'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/green-invoice/sync-owners
 * Sync all owners to Green Invoice as clients.
 * Stores the Green Invoice client ID on each owner record.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const { data: owners } = await serviceClient
    .from('owners')
    .select('id, full_name, email, phone, green_invoice_client_id')

  if (!owners || owners.length === 0) {
    return NextResponse.json({ message: 'No owners to sync', synced: 0 })
  }

  let synced = 0
  const errors: string[] = []

  for (const owner of owners) {
    try {
      const clientId = await syncOwnerAsClient({
        name: owner.full_name,
        email: owner.email,
        phone: owner.phone,
        greenInvoiceClientId: owner.green_invoice_client_id,
      })

      // Store Green Invoice client ID if new
      if (clientId !== owner.green_invoice_client_id) {
        await serviceClient
          .from('owners')
          .update({ green_invoice_client_id: clientId })
          .eq('id', owner.id)
      }

      synced++
    } catch (err) {
      errors.push(`${owner.full_name}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  return NextResponse.json({
    message: `Synced ${synced}/${owners.length} owners`,
    synced,
    errors,
  })
}
