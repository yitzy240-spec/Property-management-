import { SignJWT, jwtVerify } from 'jose'
import { createServiceClient } from '@/lib/supabase/server'
import type { MagicLinkType } from '@/types'

function getSecret(): Uint8Array {
  const secret = process.env.MAGIC_LINK_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('MAGIC_LINK_SECRET env var is required (min 32 chars)')
  }
  return new TextEncoder().encode(secret)
}

const ISSUER = 'apartmentos'

export interface MagicLinkPayload {
  property_id: string
  task_id?: string
  contractor_id?: string
  booking_id?: string
  link_type: MagicLinkType
}

/** Generate a signed JWT token for a magic link */
export async function generateMagicLinkToken(
  payload: MagicLinkPayload,
  expiresInHours: number = 72
): Promise<string> {
  const token = await new SignJWT({
    ...payload,
    iss: ISSUER,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInHours}h`)
    .setJti(crypto.randomUUID())
    .sign(getSecret())

  return token
}

/** Verify and decode a magic link JWT token */
export async function verifyMagicLinkToken(
  token: string
): Promise<MagicLinkPayload & { exp: number; jti: string }> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
  })

  return payload as unknown as MagicLinkPayload & { exp: number; jti: string }
}

/**
 * Verify a magic link token AND check it hasn't been used/revoked in the DB.
 * Returns the payload if valid, throws if invalid or used.
 */
export async function verifyAndCheckMagicLink(
  token: string
): Promise<MagicLinkPayload & { exp: number; jti: string; magic_link_id: string }> {
  const payload = await verifyMagicLinkToken(token)

  const serviceClient = createServiceClient()
  const { data: magicLink } = await serviceClient
    .from('magic_links')
    .select('id, is_used')
    .eq('token', token)
    .single()

  if (!magicLink || magicLink.is_used) {
    throw new Error('Magic link has been used or revoked')
  }

  return { ...payload, magic_link_id: magicLink.id }
}

import { jerusalemDateAt } from '@/lib/jerusalem-time'

export function computeRevealAt(revealInDays: number | null, from: Date = new Date()): Date | null {
  if (revealInDays === null) return null
  return jerusalemDateAt(revealInDays, 7, 0, from)
}

export function computeExpiresAt(expiresInDays: number | null, from: Date = new Date()): Date | null {
  if (expiresInDays === null) return null
  return jerusalemDateAt(expiresInDays, 23, 59, from)
}

export function validateRevealAndExpiry(
  revealAt: Date | null,
  expiresAt: Date | null,
  now: Date = new Date(),
): void {
  if (expiresAt && expiresAt < now) {
    throw new Error('expires_at is in the past')
  }
  if (revealAt && expiresAt && revealAt > expiresAt) {
    throw new Error('code_reveals_at cannot be after expires_at')
  }
}
