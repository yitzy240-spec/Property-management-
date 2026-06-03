import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { getCanvaAuthorizeUrl, clearCanvaTokens } from '@/lib/canva'
import crypto from 'crypto'

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const url = getCanvaAuthorizeUrl(state)

  const response = NextResponse.redirect(url)
  response.cookies.set('canva_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return response
}

export async function DELETE() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await clearCanvaTokens()
  return NextResponse.json({ ok: true })
}
