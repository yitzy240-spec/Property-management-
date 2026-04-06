import { NextResponse } from 'next/server'
import { isGmailConnected, getGmailAccessToken } from '@/lib/gmail'
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

    if (!connected) {
      return NextResponse.json({ connected: false })
    }

    // Get the connected email address
    try {
      const accessToken = await getGmailAccessToken()
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (profileRes.ok) {
        const profile = await profileRes.json()
        return NextResponse.json({
          connected: true,
          email: profile.emailAddress,
        })
      }
    } catch {
      // Token might need refresh — connection still exists
    }

    return NextResponse.json({ connected: true })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
