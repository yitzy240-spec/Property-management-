import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { callGemini } from '@/lib/ai'

/**
 * POST /api/ai/draft-reply
 * Drafts a reply to an owner's message thread.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { property_id } = await request.json()
  if (!property_id) {
    return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Get message thread
  const { data: messages } = await serviceClient
    .from('messages')
    .select('sender_role, body, created_at')
    .eq('property_id', property_id)
    .order('created_at', { ascending: true })
    .limit(20)

  // Get property context
  const { data: property } = await serviceClient
    .from('properties')
    .select('name, address')
    .eq('id', property_id)
    .single()

  // Get recent tasks for context
  const { data: tasks } = await serviceClient
    .from('tasks')
    .select('title, status')
    .eq('property_id', property_id)
    .order('created_at', { ascending: false })
    .limit(5)

  const threadText = (messages ?? [])
    .map(m => `${m.sender_role === 'admin' ? 'Manager' : 'Owner'}: ${m.body}`)
    .join('\n')

  const taskContext = (tasks ?? [])
    .map(t => `${t.title} (${t.status})`)
    .join(', ')

  const draft = await callGemini('fast', [{
    parts: [{
      text: `You are a property manager replying to a property owner. Be professional, warm, and concise.

Property: ${property?.name || 'Unknown'} at ${property?.address || ''}
Recent tasks: ${taskContext || 'None'}

Conversation:
${threadText}

Draft a reply to the owner's most recent message. Keep it under 100 words. Do not include a greeting or sign-off — just the body text.`,
    }],
  }])

  return NextResponse.json({ draft: draft || '' })
}
