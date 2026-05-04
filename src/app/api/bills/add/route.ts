import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export const maxDuration = 60

/**
 * POST /api/bills/add  (admin only)
 *
 * Accepts JSON or multipart/form-data. Multipart lets the admin attach
 * a PDF/image; we upload it to Supabase Storage and stamp the path
 * onto the bill row so it shows up on the property page like any
 * scraped bill.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const contentType = request.headers.get('content-type') ?? ''

  let payload: Record<string, unknown> = {}
  let pdfFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const dataField = form.get('data')
    if (typeof dataField !== 'string') {
      return NextResponse.json({ error: 'Missing "data" field' }, { status: 400 })
    }
    try {
      payload = JSON.parse(dataField)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in "data"' }, { status: 400 })
    }
    const fileField = form.get('file')
    if (fileField instanceof File && fileField.size > 0) pdfFile = fileField
  } else {
    payload = await request.json()
  }

  // Upload the file FIRST so we can stamp `pdf_storage_path` onto the
  // insert in one go and avoid orphan rows if storage upload fails.
  let pdfStoragePath: string | null = null
  if (pdfFile) {
    // Use a stable random key — original filename can be Hebrew, and
    // Supabase Storage rejects non-ASCII keys.
    const ext = pdfFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : (pdfFile.type.split('/')[1] ?? 'bin')
    const key = `bills/manual-${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await pdfFile.arrayBuffer())
    const { error: uploadError } = await serviceClient.storage
      .from('documents')
      .upload(key, buffer, { contentType: pdfFile.type || 'application/pdf' })
    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }
    pdfStoragePath = key
  }

  const insertRow = pdfStoragePath
    ? { ...payload, pdf_storage_path: pdfStoragePath }
    : payload

  const { error } = await serviceClient.from('bills').insert(insertRow)

  if (error) {
    // Roll back the orphaned PDF — easier than asking the admin to clean up.
    if (pdfStoragePath) {
      await serviceClient.storage.from('documents').remove([pdfStoragePath]).catch(() => {})
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/dashboard')
  revalidatePath('/bills')
  if (typeof payload.property_id === 'string') {
    revalidatePath(`/properties/${payload.property_id}`)
  }

  return NextResponse.json({ success: true })
}
