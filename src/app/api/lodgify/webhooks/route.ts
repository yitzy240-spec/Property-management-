import { NextResponse } from 'next/server'
import { subscribeWebhook, listWebhooks, unsubscribeWebhook, type LodgifyWebhookEvent } from '@/lib/lodgify'
import { requireAdmin, AuthError } from '@/lib/auth'

const EVENTS_TO_SUBSCRIBE: LodgifyWebhookEvent[] = [
  'booking_new_any_status',
  'booking_change',
  'booking_status_change_declined',
  'availability_change',
  'guest_message_received',
]

/**
 * GET /api/lodgify/webhooks — list current webhook subscriptions
 * POST /api/lodgify/webhooks — subscribe to all relevant events
 * DELETE /api/lodgify/webhooks — unsubscribe from all
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const webhooks = await listWebhooks()
    return NextResponse.json({ webhooks })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl || baseUrl.includes('localhost')) {
    return NextResponse.json({
      error: 'Webhooks require a public URL. Deploy to Vercel first, then set NEXT_PUBLIC_APP_URL.',
    }, { status: 400 })
  }

  const targetUrl = `${baseUrl}/api/webhooks/lodgify`
  const results: { event: string; id?: string; error?: string }[] = []

  for (const event of EVENTS_TO_SUBSCRIBE) {
    try {
      const sub = await subscribeWebhook(targetUrl, event)
      results.push({ event, id: sub.id })
    } catch (err) {
      results.push({ event, error: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const successCount = results.filter(r => r.id).length
  return NextResponse.json({
    message: `Subscribed to ${successCount}/${EVENTS_TO_SUBSCRIBE.length} events`,
    results,
  })
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const webhooks = await listWebhooks()
    for (const wh of webhooks) {
      await unsubscribeWebhook(wh.id)
    }
    return NextResponse.json({ message: `Unsubscribed from ${webhooks.length} webhooks` })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
