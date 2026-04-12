import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/statements/[id]/approve
 * Admin approves a statement — moves from draft/pending_approval to approved.
 * Only approved statements can be invoiced or emailed to owners.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  let user
  try {
    user = await requireAdmin()
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

  if (statement.status !== 'draft' && statement.status !== 'pending_approval') {
    return NextResponse.json({ error: `Cannot approve statement in "${statement.status}" status` }, { status: 400 })
  }

  await serviceClient
    .from('monthly_statements')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', params.id)

  return NextResponse.json({ message: 'Statement approved' })
}
