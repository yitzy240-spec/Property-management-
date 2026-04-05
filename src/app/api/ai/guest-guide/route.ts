import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { callGemini } from '@/lib/ai'

/**
 * GET /api/ai/guest-guide?property_id=xxx&lang=he
 * Returns a translated guest guide. Caches per property+language.
 * Internal-only: requires CRON_SECRET or admin auth.
 */
export async function GET(request: Request) {
  // Auth: internal server calls use CRON_SECRET, admin calls use session
  const authHeader = request.headers.get('authorization')
  const isInternal = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isInternal) {
    // Try admin auth as fallback
    try {
      const { requireAdmin } = await import('@/lib/auth')
      await requireAdmin()
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('property_id')
  const lang = searchParams.get('lang') || 'en'

  if (!propertyId) {
    return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Check cache first
  const { data: cached } = await serviceClient
    .from('guest_guide_cache')
    .select('guide_content')
    .eq('property_id', propertyId)
    .eq('language_code', lang)
    .single()

  if (cached) {
    return NextResponse.json({ content: cached.guide_content, language: lang, cached: true })
  }

  // Fetch property details for guide generation
  const { data: property } = await serviceClient
    .from('properties')
    .select('name, address, neighborhood, city, guest_guide_base_text, entry_code, youtube_tutorial_url')
    .eq('id', propertyId)
    .single()

  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  const languageNames: Record<string, string> = {
    en: 'English', he: 'Hebrew', ru: 'Russian', fr: 'French',
    es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese',
    ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  }
  const langName = languageNames[lang] || lang

  const baseText = property.guest_guide_base_text || `
Welcome to ${property.name} at ${property.address}, ${property.neighborhood || property.city}.
This is a short-term rental apartment managed by Marcus Properties.
Check-in is at 2:00 PM and check-out is at 10:00 AM.
${property.youtube_tutorial_url ? 'A video guide is available for entering the apartment.' : ''}
Please treat the apartment as your home and leave it tidy for the next guest.
For any issues, contact your host through the booking platform.`

  const prompt = lang === 'en'
    ? `Write a friendly, helpful guest check-in guide for this apartment in English. Include arrival directions, entry instructions, house rules, and local tips for the ${property.neighborhood || property.city} neighborhood in Jerusalem. Keep it concise (200-300 words).

Property: ${property.name}
Address: ${property.address}, ${property.neighborhood || property.city}
Base info: ${baseText}`
    : `Translate and adapt this guest check-in guide into ${langName}. Make it feel natural in ${langName}, not a word-for-word translation. Keep the same structure and information but adapt cultural references as needed. 200-300 words.

Original guide:
${baseText}

Property: ${property.name}
Address: ${property.address}, ${property.neighborhood || property.city}, Jerusalem`

  const content = await callGemini('pro', [{ parts: [{ text: prompt }] }])

  if (!content) {
    return NextResponse.json({ error: 'Guide generation failed' }, { status: 500 })
  }

  // Cache the result
  await serviceClient.from('guest_guide_cache').upsert({
    property_id: propertyId,
    language_code: lang,
    guide_content: content,
  }, { onConflict: 'property_id,language_code' })

  return NextResponse.json({ content, language: lang, cached: false })
}
