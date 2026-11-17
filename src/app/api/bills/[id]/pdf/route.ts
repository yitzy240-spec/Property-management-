import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * POST /api/bills/:id/pdf  (admin only)
 * 
 * Upload or replace a bill's PDF attachment.
 * Accepts multipart/form-data with a "file" field and optional "replace" field.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  
  const formData = await request.formData()
  const file = formData.get('file')
  const replace = formData.get('replace') === 'true'

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing or empty file' }, { status: 400 })
  }

  // Check if bill exists and get current PDF path
  const { data: bill, error: fetchError } = await serviceClient
    .from('bills')
    .select('id, pdf_storage_path')
    .eq('id', params.id)
    .single()

  if (fetchError || !bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  if (bill.pdf_storage_path && !replace) {
    return NextResponse.json({ 
      error: 'Bill already has a PDF. Set replace=true to override.' 
    }, { status: 409 })
  }

  // Delete old PDF if replacing
  if (bill.pdf_storage_path && replace) {
    await serviceClient.storage
      .from('documents')
      .remove([bill.pdf_storage_path])
      .catch(() => {}) // Ignore errors if file doesn't exist
  }

  // Upload new PDF
  const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : (file.type.split('/')[1] ?? 'bin')
  const key = `bills/manual-${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await serviceClient.storage
    .from('documents')
    .upload(key, buffer, { contentType: file.type || 'application/pdf' })

  if (uploadError) {
    return NextResponse.json({ 
      error: `Upload failed: ${uploadError.message}` 
    }, { status: 500 })
  }

  // Update bill record
  const { error: updateError } = await serviceClient
    .from('bills')
    .update({ pdf_storage_path: key })
    .eq('id', params.id)

  if (updateError) {
    // Cleanup uploaded file on DB error
    await serviceClient.storage.from('documents').remove([key]).catch(() => {})
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  revalidatePath('/dashboard')
  revalidatePath('/bills')

  return NextResponse.json({ success: true, pdfStoragePath: key })
}
