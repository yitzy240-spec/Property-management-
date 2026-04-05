/**
 * Shared AI helper — wraps geminiGenerate with key handling and JSON parsing.
 */

import { geminiGenerate, type GeminiTier } from './gemini'

/**
 * Call Gemini with automatic API key resolution.
 * Returns raw text or null.
 */
export async function callGemini(
  tier: GeminiTier,
  contents: Array<{ parts: Array<Record<string, unknown>> }>,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  return geminiGenerate(tier, apiKey, contents)
}

/**
 * Call Gemini and parse the response as JSON.
 * Extracts the first JSON object or array from the response text.
 */
export async function callGeminiJSON<T = unknown>(
  tier: GeminiTier,
  contents: Array<{ parts: Array<Record<string, unknown>> }>,
): Promise<T | null> {
  const text = await callGemini(tier, contents)
  if (!text) return null

  try {
    // Try direct parse first
    return JSON.parse(text) as T
  } catch {
    // Extract JSON from markdown code blocks or raw text
    try {
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlock) return JSON.parse(codeBlock[1]) as T

      const jsonMatch = text.match(/[\[{][\s\S]*?[\]}]/)
      if (!jsonMatch) return null
      return JSON.parse(jsonMatch[0]) as T
    } catch {
      return null
    }
  }
}
