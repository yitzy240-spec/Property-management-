import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { ALL_SCOPES, generateToken } from '@/lib/agent-api/core'

/**
 * Admin management of agent API tokens (Settings → Agent API).
 * GET    → tokens (no secrets) + the 50 most recent audit entries
 * POST   {name, scopes[]} → creates a token; the raw value is returned ONCE
 * DELETE ?id= → revokes
 */
async function guard() {
  try {
    return { user: await requireAdmin() }
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401
    return { response: NextResponse.json({ error: err instanceof Error ? err.message : 'Unauthorized' }, { status }) }
  }
}

export async function GET() {
  const g = await guard()
  if (g.response) return g.response
  const db = createServiceClient()
  const [{ data: tokens }, { data: audit }] = await Promise.all([
    db.from('api_tokens').select('id, name, token_prefix, scopes, created_at, last_used_at, revoked_at').order('created_at', { ascending: false }),
    db.from('agent_audit_log').select('id, token_name, method, path, resource, resource_id, action, created_at').order('created_at', { ascending: false }).limit(50),
  ])
  return NextResponse.json({ tokens: tokens ?? [], audit: audit ?? [], scopes: ALL_SCOPES })
}

const CreateToken = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(ALL_SCOPES as [string, ...string[]])).min(1),
})

export async function POST(request: Request) {
  const g = await guard()
  if (g.response) return g.response
  const parsed = CreateToken.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Name and at least one scope are required.' }, { status: 400 })

  const { raw, hash, prefix } = generateToken()
  const db = createServiceClient()
  const { data, error } = await db
    .from('api_tokens')
    .insert({ name: parsed.data.name, scopes: parsed.data.scopes, token_hash: hash, token_prefix: prefix, created_by: g.user!.id })
    .select('id, name, token_prefix, scopes, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token: data, secret: raw })
}

export async function DELETE(request: Request) {
  const g = await guard()
  if (g.response) return g.response
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = createServiceClient()
  const { error } = await db.from('api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
