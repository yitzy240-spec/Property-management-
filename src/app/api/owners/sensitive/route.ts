import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * GET /api/owners/sensitive?owner_id=xxx
 * Returns decrypted sensitive data for an owner (admin only)
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const ownerId = url.searchParams.get('owner_id')
  if (!ownerId) return NextResponse.json({ error: 'owner_id required' }, { status: 400 })

  const serviceClient = createServiceClient()
  const { data, error } = await serviceClient
    .from('owner_sensitive_data')
    .select('*')
    .eq('owner_id', ownerId)
    .order('data_type')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Decrypt passport numbers server-side
  const decrypted = await Promise.all(
    (data ?? []).map(async (item) => {
      if (item.data_type === 'passport' && item.encrypted_value) {
        try {
          const passportNumber = await decrypt(item.encrypted_value)
          return { ...item, decrypted_value: passportNumber, encrypted_value: '[encrypted]' }
        } catch {
          return { ...item, decrypted_value: '[decryption failed]', encrypted_value: '[encrypted]' }
        }
      }
      return { ...item, decrypted_value: null }
    })
  )

  return NextResponse.json({ data: decrypted })
}

/**
 * POST /api/owners/sensitive
 * Add sensitive data for an owner (admin only)
 * Body: { owner_id, data_type, value?, card_last_four?, card_type?, label, notes? }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { owner_id, data_type, value, card_last_four, card_type, label, notes } = body

  if (!owner_id || !data_type || !label) {
    return NextResponse.json({ error: 'owner_id, data_type, and label required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  const record: Record<string, unknown> = {
    owner_id,
    data_type,
    label,
    notes: notes || null,
  }

  if (data_type === 'passport') {
    if (!value) return NextResponse.json({ error: 'value required for passport' }, { status: 400 })
    record.encrypted_value = await encrypt(value)
  } else if (data_type === 'credit_card_summary') {
    if (!card_last_four || card_last_four.length !== 4) {
      return NextResponse.json({ error: 'card_last_four must be exactly 4 digits' }, { status: 400 })
    }
    record.card_last_four = card_last_four
    record.card_type = card_type || null
  }

  const { error } = await serviceClient
    .from('owner_sensitive_data')
    .upsert(record, { onConflict: 'owner_id,data_type,label' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/owners/sensitive?id=xxx
 * Remove a sensitive data record (admin only)
 */
export async function DELETE(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const serviceClient = createServiceClient()
  const { error } = await serviceClient
    .from('owner_sensitive_data')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
