import { AgentError, json, refreshAdminPages, withAgent } from '@/lib/agent-api/core'
import { loadBill } from '@/lib/agent-api/utilities'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { id: string }

/**
 * POST /api/agent/v1/bills/:id/pdf — Attach a PDF to an existing bill.
 * 
 * Accepts multipart/form-data with a "file" field containing the PDF or image.
 * Optional "replace" field (true/false string) to allow replacing an existing PDF.
 * 
 * By default, refuses to replace an existing PDF. Set replace=true to override.
 * Allows attaching to approved bills if pdf_storage_path is null (backfill case).
 */
export const POST = withAgent<Params>('bills:write', async (request, { db, audit }, { id }) => {
  const serviceClient = createServiceClient()
  const contentType = request.headers.get('content-type') ?? ''
  
  if (!contentType.includes('multipart/form-data')) {
    throw new AgentError(400, 'This endpoint requires multipart/form-data with a "file" field.')
  }
  
  const form = await request.formData()
  const fileField = form.get('file')
  const replaceStr = form.get('replace')
  const shouldReplace = replaceStr === 'true' || replaceStr === '1'
  
  if (!(fileField instanceof File) || fileField.size === 0) {
    throw new AgentError(400, 'Missing or empty "file" field.')
  }
  
  const before = await loadBill(db, id)
  
  if (before.has_pdf && !shouldReplace) {
    throw new AgentError(409, 'This bill already has a PDF. Set replace=true to override.')
  }
  
  const ext = fileField.name.toLowerCase().endsWith('.pdf') ? 'pdf' : (fileField.type.split('/')[1] ?? 'bin')
  const key = `bills/manual-${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await fileField.arrayBuffer())
  
  const { error: uploadError } = await serviceClient.storage
    .from('documents')
    .upload(key, buffer, { contentType: fileField.type || 'application/pdf' })
  
  if (uploadError) {
    throw new AgentError(500, `Upload failed: ${uploadError.message}`)
  }
  
  const { error: updateError } = await db
    .from('bills')
    .update({ pdf_storage_path: key })
    .eq('id', id)
  
  if (updateError) {
    await serviceClient.storage.from('documents').remove([key]).catch(() => {})
    throw new AgentError(400, updateError.message)
  }
  
  const bill = await loadBill(db, id)
  await audit({ resource: 'bill', resourceId: id, action: 'update', before, after: bill })
  refreshAdminPages('/bills', `/properties/${bill.property_id}`)
  
  return json({ bill })
})
