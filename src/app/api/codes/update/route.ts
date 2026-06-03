import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { refreshCanvaTokensIfNeeded, parseCanvaDesignId, updateCanvaDesignCodes } from '@/lib/canva'

// Vercel: allow this route up to 60s. With ~4 Canva-linked properties and ~10s
// per Anthropic+MCP call, comfortable headroom. Cap property_ids server-side
// to keep within budget.
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
    update_canva: boolean
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
      update_canva: body.update_canva,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? 'failed to create job' }, { status: 500 })
  }

  // Run synchronously: Vercel serverless kills any work that outlives the response,
  // so we keep the function alive until processJob completes. The client polls
  // /api/codes/jobs/:id and will see status='done' on first poll. The per-property
  // row updates inside processJob remain useful as a debug trail in the DB.
  try {
    await processJob(job.id, body)
  } catch {
    // Errors are already persisted into the job row's results.
  }

  return NextResponse.json({ job_id: job.id })
}

async function processJob(
  jobId: string,
  input: { apartment_code?: string; building_code?: string; property_ids: string[]; update_canva: boolean },
) {
  const service = createServiceClient()
  const results: Record<string, { db: string; canva: string; message: string }> = {}

  let canvaTokens = null
  if (input.update_canva) {
    try {
      canvaTokens = await refreshCanvaTokensIfNeeded()
    } catch {
      canvaTokens = null
    }
  }

  for (const propertyId of input.property_ids) {
    const result = { db: 'failed', canva: 'skipped', message: '' }

    const updates: Record<string, string> = {}
    if (input.apartment_code) updates.entry_code = input.apartment_code
    if (input.building_code) updates.building_entry_code = input.building_code

    const { data: property, error: updateErr } = await service
      .from('properties')
      .update(updates)
      .eq('id', propertyId)
      .select('name, canva_design_url')
      .single()

    if (updateErr || !property) {
      result.message = updateErr?.message ?? 'property not found'
      results[propertyId] = result
      await persistResults(jobId, results)
      continue
    }
    result.db = 'ok'

    if (input.update_canva && canvaTokens) {
      const designId = parseCanvaDesignId(property.canva_design_url)
      if (!designId) {
        result.canva = 'skipped'
        result.message = 'No Canva design linked'
      } else {
        try {
          const canvaResult = await updateCanvaDesignCodes({
            designId,
            designName: property.name,
            newApartmentCode: input.apartment_code,
            newBuildingCode: input.building_code,
            accessToken: canvaTokens.access_token,
          })
          result.canva = canvaResult.success ? 'ok' : 'failed'
          result.message = canvaResult.message
        } catch (err) {
          result.canva = 'failed'
          result.message = err instanceof Error ? err.message : 'Canva call failed'
        }
      }
    } else if (input.update_canva && !canvaTokens) {
      result.canva = 'skipped'
      result.message = 'Canva not connected. Go to Settings → Canva.'
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
