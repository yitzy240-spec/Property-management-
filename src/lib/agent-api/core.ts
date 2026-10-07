/**
 * Agent API core — authentication, scopes, audit logging and JSON helpers for
 * /api/agent/v1/* (used by Ariel's Grok Bot).
 *
 * Auth: `Authorization: Bearer aos_...`. Tokens are created in Settings →
 * Integrations, shown once, and stored only as a SHA-256 hash in api_tokens.
 * Every write (and every read of door codes) is recorded in agent_audit_log.
 */
import { createHash, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'

export const AGENT_SCOPES = {
  'bookings:read': 'Read bookings and payments',
  'bookings:write': 'Create, edit and delete bookings; record payments',
  'tasks:read': 'Read tasks (incl. cleaning) and contractors',
  'tasks:write': 'Create, move, reassign and delete tasks',
  'properties:read': 'Read properties (no codes)',
  'owners:read': 'Read owners',
  'owners:write': 'Edit owner records',
  'utilities:read': 'Read utility accounts',
  'utilities:write': 'Add and edit utility accounts',
  'bills:read': 'Read bills',
  'bills:write': 'Add and edit bills (approval stays with the admin)',
  'codes:read': 'Read door codes and WiFi (every read is logged)',
} as const

export type AgentScope = keyof typeof AGENT_SCOPES
export const ALL_SCOPES = Object.keys(AGENT_SCOPES) as AgentScope[]

export type ServiceClient = ReturnType<typeof createServiceClient>

export interface AgentToken {
  id: string
  name: string
  scopes: string[]
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** New random token. Only the hash is stored; the raw value is shown once. */
export function generateToken(): { raw: string; hash: string; prefix: string } {
  const raw = `aos_${randomBytes(32).toString('base64url')}`
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 10) }
}

export class AgentError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export interface AgentContext {
  token: AgentToken
  db: ServiceClient
  /** Record a write (or a sensitive read) in the audit log. */
  audit: (entry: {
    resource: string
    resourceId?: string | null
    action: 'create' | 'update' | 'delete' | 'read_codes'
    before?: unknown
    after?: unknown
  }) => Promise<void>
}

async function authenticate(request: Request, db: ServiceClient, scope: AgentScope): Promise<AgentToken> {
  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(aos_[A-Za-z0-9_-]+)$/)
  if (!match) throw new AgentError(401, 'Missing or malformed token. Send "Authorization: Bearer aos_...".')

  const { data: token } = await db
    .from('api_tokens')
    .select('id, name, scopes, revoked_at')
    .eq('token_hash', hashToken(match[1]))
    .maybeSingle()

  if (!token || token.revoked_at) throw new AgentError(401, 'Invalid or revoked token.')
  if (!(token.scopes as string[]).includes(scope)) {
    throw new AgentError(403, `This token lacks the "${scope}" scope.`)
  }

  // Best-effort; never block the request on it.
  void db.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', token.id)
  return { id: token.id, name: token.name, scopes: token.scopes as string[] }
}

/**
 * Wrap a route handler: authenticate + scope-check, provide the DB client and
 * audit logger, and turn validation / known errors into JSON responses.
 */
export function withAgent<P = Record<string, string>>(
  scope: AgentScope,
  handler: (request: Request, ctx: AgentContext, params: P) => Promise<Response>,
) {
  return async (request: Request, route?: { params: P }): Promise<Response> => {
    const db = createServiceClient()
    try {
      const token = await authenticate(request, db, scope)
      const path = new URL(request.url).pathname
      const audit: AgentContext['audit'] = async (e) => {
        await db.from('agent_audit_log').insert({
          token_id: token.id,
          token_name: token.name,
          method: request.method,
          path,
          resource: e.resource,
          resource_id: e.resourceId ?? null,
          action: e.action,
          before: e.before ?? null,
          after: e.after ?? null,
        })
      }
      return await handler(request, { token, db, audit }, (route?.params ?? {}) as P)
    } catch (err) {
      if (err instanceof AgentError) return json({ error: err.message, details: err.details }, err.status)
      if (err instanceof ZodError) {
        return json({ error: 'Invalid request', details: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, 400)
      }
      console.error('[agent-api]', err)
      return json({ error: 'Internal error' }, 500)
    }
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new AgentError(400, 'Body must be valid JSON.')
  }
}

/** Throw 404 / 500 for a Supabase single-row result. */
export function requireRow<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error && result.error.message && !/0 rows|no rows/i.test(result.error.message)) {
    throw new AgentError(500, result.error.message)
  }
  if (!result.data) throw new AgentError(404, `${what} not found.`)
  return result.data
}

/** Major units (e.g. 1000.5) ↔ smallest unit integers (100050). */
export const toMinor = (major: number | null | undefined) =>
  major === null || major === undefined ? null : Math.round(major * 100)
export const toMajor = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? null : minor / 100

export function paging(url: URL, max = 500): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 1), max)
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0)
  return { limit, offset }
}

/** Bust cached admin pages after an agent write so the UI shows it immediately. */
export function refreshAdminPages(...paths: string[]) {
  for (const path of ['/dashboard', '/calendar', ...paths]) {
    try {
      revalidatePath(path)
    } catch {
      // Outside a request scope (tests) — nothing to refresh.
    }
  }
}
