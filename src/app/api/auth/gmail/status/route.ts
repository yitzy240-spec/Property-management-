import { NextResponse } from 'next/server'
import { isGmailConnected } from '@/lib/gmail'
import { requireAuth, AuthError } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const connected = await isGmailConnected()
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
