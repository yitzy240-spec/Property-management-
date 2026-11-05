import { AgentError, json, paging, readJson, refreshAdminPages, toMinor, withAgent } from '@/lib/agent-api/core'
import { BILL_COLUMNS, BillCreate, loadBill, serializeBill } from '@/lib/agent-api/utilities'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/agent/v1/bills — ?property_id= &bill_type= &status=pending_review,approved
 *   &from=YYYY-MM-DD &to=YYYY-MM-DD (due date) &limit= &offset=
 */
export const GET = withAgent('bills:read', async (request, { db }) => {
  const url = new URL(request.url)
  const p = url.searchParams
  const { limit, offset } = paging(url)
  let q = db
    .from('bills')
    .select(BILL_COLUMNS)
    .order('due_date', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (p.get('property_id')) q = q.eq('property_id', p.get('property_id')!)
  if (p.get('bill_type')) q = q.eq('bill_type', p.get('bill_type')!)
  if (p.get('status')) q = q.in('status', p.get('status')!.split(',').map(s => s.trim()))
  if (p.get('from')) q = q.gte('due_date', p.get('from')!)
  if (p.get('to')) q = q.lte('due_date', p.get('to')!)
  const { data, error } = await q
  if (error) throw new AgentError(500, error.message)
  return json({ bills: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(serializeBill), limit, offset })
})

/**
 * POST /api/agent/v1/bills — add a bill (amount in ₪). It lands in the admin's
 * review queue as pending_review; approval and payment method stay with the
 * admin because they feed owner statements.
 * 
 * Supports both JSON and multipart/form-data. For multipart:
 *   - "data" field: JSON string with bill fields
 *   - "file" field: optional PDF or image attachment
 */
export const POST = withAgent('bills:write', async (request, { db, audit }) => {
  const serviceClient = createServiceClient()
  const contentType = request.headers.get('content-type') ?? ''
  
  let body: unknown
  let pdfFile: File | null = null
  
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const dataField = form.get('data')
    if (typeof dataField !== 'string') {
      throw new AgentError(400, 'Multipart requests must include a "data" field with JSON.')
    }
    try {
      body = JSON.parse(dataField)
    } catch {
      throw new AgentError(400, 'Invalid JSON in "data" field.')
    }
    const fileField = form.get('file')
    if (fileField instanceof File && fileField.size > 0) pdfFile = fileField
  } else {
    body = await readJson(request)
  }
  
  const parsed = BillCreate.parse(body)
  
  let pdfStoragePath: string | null = null
  if (pdfFile) {
    const ext = pdfFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : (pdfFile.type.split('/')[1] ?? 'bin')
    const key = `bills/manual-${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await pdfFile.arrayBuffer())
    const { error: uploadError } = await serviceClient.storage
      .from('documents')
      .upload(key, buffer, { contentType: pdfFile.type || 'application/pdf' })
    if (uploadError) {
      throw new AgentError(500, `Upload failed: ${uploadError.message}`)
    }
    pdfStoragePath = key
  }
  
  const { data, error } = await db
    .from('bills')
    .insert({
      property_id: parsed.property_id,
      bill_type: parsed.bill_type,
      amount_agorot: toMinor(parsed.amount_ils),
      due_date: parsed.due_date ?? null,
      billing_period_start: parsed.billing_period_start ?? null,
      billing_period_end: parsed.billing_period_end ?? null,
      status: 'pending_review',
      pdf_storage_path: pdfStoragePath,
    })
    .select('id')
    .single()
  
  if (error || !data) {
    if (pdfStoragePath) {
      await serviceClient.storage.from('documents').remove([pdfStoragePath]).catch(() => {})
    }
    throw new AgentError(400, error?.message ?? 'Insert failed')
  }
  
  const bill = await loadBill(db, data.id)
  await audit({ resource: 'bill', resourceId: data.id, action: 'create', after: bill })
  refreshAdminPages('/bills', `/properties/${parsed.property_id}`)
  return json({ bill }, 201)
})
