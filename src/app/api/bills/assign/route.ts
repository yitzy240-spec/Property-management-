import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/bills/assign
 * Assign or reassign a bill to a property, and optionally confirm the sender mapping.
 *
 * Body: { bill_id, property_id, confirm_mapping?: boolean }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bill_id, property_id, confirm_mapping } = await request.json()

  if (!bill_id || !property_id) {
    return NextResponse.json({ error: 'bill_id and property_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Update bill with new property assignment
  const { data: bill, error: updateError } = await serviceClient
    .from('bills')
    .update({ property_id })
    .eq('id', bill_id)
    .select('gmail_message_id, bill_type, ai_parsed_data')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // If confirm_mapping, create/update a confirmed sender mapping for future auto-matching
  if (confirm_mapping && bill) {
    const aiData = bill.ai_parsed_data as Record<string, unknown> | null
    // Extract sender email from the gmail message if available
    // For now, use the AI-parsed data which includes match_method
    const senderPattern = (aiData?.account_holder as string) || null

    // Upsert the mapping as confirmed
    await serviceClient.from('bill_sender_mappings').upsert({
      sender_email: `bill_${bill.bill_type}_${property_id}`, // Key for this type+property combo
      sender_name_pattern: senderPattern,
      subject_pattern: senderPattern,
      property_id,
      bill_type: bill.bill_type,
      confirmed: true,
    }, { onConflict: 'sender_email,property_id,bill_type' })
  }

  return NextResponse.json({ success: true })
}
