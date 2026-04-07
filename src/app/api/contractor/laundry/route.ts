import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMagicLinkToken } from '@/lib/magic-links'
import { notifyAdmins } from '@/lib/notifications'

/**
 * POST /api/contractor/laundry
 * Contractor submits laundry counts → creates a batch for admin review.
 */
export async function POST(request: Request) {
  const { token, items } = await request.json() as {
    token: string
    items: { item_name: string; quantity: number }[]
  }

  let payload
  try {
    payload = await verifyMagicLinkToken(token)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'No items submitted' }, { status: 400 })
  }

  // Filter out zero-quantity items
  const nonZeroItems = items.filter(i => i.quantity > 0)
  if (nonZeroItems.length === 0) {
    return NextResponse.json({ error: 'All quantities are zero' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Create laundry batch (pending admin review — not sent yet)
  const { data: batch, error } = await serviceClient
    .from('laundry_batches')
    .insert({
      property_id: payload.property_id,
      items: nonZeroItems,
      sent_at: null, // Not sent until admin reviews
      laundry_provider_notified: false,
      submitted_by: 'contractor',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update inventory: move items from closet to laundry
  for (const item of nonZeroItems) {
    const { data: invItem } = await serviceClient
      .from('inventory_items')
      .select('id, quantity_in_closet, quantity_at_laundry')
      .eq('property_id', payload.property_id)
      .ilike('item_name', item.item_name)
      .single()

    if (invItem) {
      await serviceClient.from('inventory_items').update({
        quantity_in_closet: Math.max(0, invItem.quantity_in_closet - item.quantity),
        quantity_at_laundry: invItem.quantity_at_laundry + item.quantity,
        last_counted_at: new Date().toISOString(),
      }).eq('id', invItem.id)
    }
  }

  // Get property name for notification
  const { data: property } = await serviceClient
    .from('properties')
    .select('name')
    .eq('id', payload.property_id)
    .single()

  // Notify admin
  await notifyAdmins({
    title: `Laundry submitted — ${property?.name || 'Property'}`,
    body: nonZeroItems.map(i => `${i.item_name} x${i.quantity}`).join(', '),
    link: '/inventory',
  })

  return NextResponse.json({ success: true, batchId: batch?.id })
}
