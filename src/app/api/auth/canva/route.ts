import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { getCanvaAuthorizeUrl, clearCanvaTokens, generatePkcePair } from '@/lib/canva'
import crypto from 'crypto'

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const { verifier, challenge } = generatePkcePair()
  const url = getCanvaAuthorizeUrl(state, challenge)

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 10,
    path: '/',
  }
  const response = NextResponse.redirect(url)
  response.cookies.set('canva_oauth_state', state, cookieOpts)
  // PKCE verifier — replayed at the callback's token exchange. Lax so it survives
  // the cross-site return from canva.com, httpOnly so client JS can't read it.
  response.cookies.set('canva_code_verifier', verifier, cookieOpts)
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
