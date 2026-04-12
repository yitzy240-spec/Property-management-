import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * DELETE /api/statements/[id]/delete
 * Delete a statement (only draft/pending_approval). Sent/paid cannot be deleted.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: statement, error } = await serviceClient
    .from('monthly_statements')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (error || !statement) {
    return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  }

  if (statement.status === 'sent' || statement.status === 'paid' || statement.status === 'partially_paid') {
    return NextResponse.json({ error: `Cannot delete statement in "${statement.status}" status` }, { status: 400 })
  }

  // Delete line items first (cascade should handle this, but be explicit)
  await serviceClient.from('statement_line_items').delete().eq('statement_id', params.id)
  await serviceClient.from('statement_payments').delete().eq('statement_id', params.id)
  await serviceClient.from('monthly_statements').delete().eq('id', params.id)

  return NextResponse.json({ message: 'Statement deleted' })
}
