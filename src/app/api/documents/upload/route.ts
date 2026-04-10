import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const title = formData.get('title') as string
  const category = formData.get('category') as string
  const propertyId = formData.get('property_id') as string || null
  const expiryDate = formData.get('expiry_date') as string || null

  if (!file || !title) {
    return NextResponse.json({ error: 'file and title required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const filePath = `vault/${Date.now()}_${file.name}`

  // Upload to storage
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await serviceClient.storage
    .from('documents')
    .upload(filePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    storagePath: filePath,
    fileSize: file.size,
    filename: file.name,
  })
}
