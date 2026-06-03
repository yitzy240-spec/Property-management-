import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('code_update_jobs')
    .select('status, results, started_at, completed_at')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  return NextResponse.json(data)
}
