/**
 * Gemini AI — centralized model configuration and helper
 *
 * Model tiers:
 *   - lite:  Gemini 3.1 Flash-Lite — cheapest, high-volume structured extraction
 *   - fast:  Gemini 3 Flash — balanced speed/quality
 *   - pro:   Gemini 3.1 Pro — best reasoning, vision, and writing quality
 *
 * Usage:
 *   import { geminiGenerate, GEMINI_MODELS } from '@/lib/gemini'
 *   const result = await geminiGenerate('pro', apiKey, contents)
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const GEMINI_MODELS = {
  /** High-volume structured extraction (bills, doc classification) */
  lite: 'gemini-3.1-flash-lite',
  /** Balanced speed/quality */
  fast: 'gemini-3-flash',
  /** Best quality — owner-facing writing, vision judgment, complex reasoning */
  pro: 'gemini-3.1-pro',
} as const

export type GeminiTier = keyof typeof GEMINI_MODELS

/**
 * Call the Gemini API with the specified model tier.
 * Returns the raw text response or null on failure.
 */
export async function geminiGenerate(
  tier: GeminiTier,
  apiKey: string,
  contents: Array<{ parts: Array<Record<string, unknown>> }>,
): Promise<string | null> {
  const model = GEMINI_MODELS[tier]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({ contents }),
        signal: controller.signal,
      },
    )

    clearTimeout(timeout)

    if (!response.ok) {
      console.error(`Gemini ${tier} (${model}) error: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  } catch (err) {
    clearTimeout(timeout)
    console.error(`Gemini ${tier} (${model}) call failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Test that a Gemini API key is valid.
 * Uses the cheapest model to minimize cost.
 */
export async function testGeminiKey(apiKey: string): Promise<{
  success: boolean
  message: string
}> {
  const model = GEMINI_MODELS.lite
  const res = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with just the word OK' }] }],
      }),
    },
  )

  if (res.ok) {
    return { success: true, message: 'Connected (Gemini 3.1)' }
  }

  if (res.status === 429) {
    return { success: true, message: 'Key valid (Gemini) — enable billing for quota' }
  }

  const body = await res.json().catch(() => ({}))

  if (body?.error?.code === 400) {
    return { success: false, message: 'Invalid Gemini key' }
  }

  return {
    success: false,
    message: body?.error?.message || `Gemini returned ${res.status}`,
  }
}
