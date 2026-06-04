import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export const maxDuration = 60
const MAX_PROPERTIES_PER_JOB = 20

export async function POST(request: Request) {
  let user
  try {
    user = await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    apartment_code?: string
    building_code?: string
    property_ids: string[]
  }

  if (!body.property_ids?.length) {
    return NextResponse.json({ error: 'property_ids required' }, { status: 400 })
  }
  if (body.property_ids.length > MAX_PROPERTIES_PER_JOB) {
    return NextResponse.json(
      { error: `Up to ${MAX_PROPERTIES_PER_JOB} properties per job. Split into multiple runs.` },
      { status: 400 },
    )
  }
  if (!body.apartment_code && !body.building_code) {
    return NextResponse.json({ error: 'apartment_code or building_code required' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: job, error: jobErr } = await service
    .from('code_update_jobs')
    .insert({
      created_by: user.id,
      apartment_code: body.apartment_code ?? null,
      building_code: body.building_code ?? null,
      property_ids: body.property_ids,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? 'failed to create job' }, { status: 500 })
  }

  try {
    await processJob(job.id, body)
  } catch {
    // Errors are already persisted into the job row's results.
  }

  return NextResponse.json({ job_id: job.id })
}

async function processJob(
  jobId: string,
  input: { apartment_code?: string; building_code?: string; property_ids: string[] },
) {
  const service = createServiceClient()
  const results: Record<string, { db: string; message: string }> = {}

  for (const propertyId of input.property_ids) {
    const result = { db: 'failed', message: '' }

    const updates: Record<string, string> = {}
    if (input.apartment_code) updates.entry_code = input.apartment_code
    if (input.building_code) updates.building_entry_code = input.building_code

    const { error: updateErr } = await service
      .from('properties')
      .update(updates)
      .eq('id', propertyId)
      .select('name')
      .single()

    if (updateErr) {
      result.message = updateErr.message
    } else {
      result.db = 'ok'
    }

    results[propertyId] = result
    await persistResults(jobId, results)
  }

  await service
    .from('code_update_jobs')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

async function persistResults(jobId: string, results: Record<string, unknown>) {
  const service = createServiceClient()
  await service.from('code_update_jobs').update({ results }).eq('id', jobId)
}
