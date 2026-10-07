import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashToken } from '@/lib/agent-api/core'
import { assertSyncSafe, bookingPatchToRow, derivedPaymentStatus } from '@/lib/agent-api/bookings'

/**
 * Agent API (/api/agent/v1) — used by Ariel's Grok Bot with full write access
 * to real data, so auth, scopes, the sync guard and audit logging are tested.
 */

// ── In-memory Supabase stand-in ──
type Row = Record<string, unknown>
let tables: Record<string, Row[]>
const allUpdates: Array<{ table: string; values: Row }> = []
/** Data writes only — excludes the api_tokens.last_used_at bookkeeping. */
const dataUpdates = () => allUpdates.filter(u => u.table !== 'api_tokens')
const inserts: Array<{ table: string; values: Row }> = []
let failAudit = false

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'delete' = 'select'
  let values: Row = {}
  const rows = () => (tables[table] ?? []).filter(r => filters.every(f => f(r)))
  const q: Record<string, unknown> = {
    select: () => q,
    order: () => q,
    range: () => q,
    eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return q },
    is: (col: string, val: unknown) => { filters.push(r => (r[col] ?? null) === val); return q },
    in: () => q,
    gte: () => q,
    lte: () => q,
    ilike: () => q,
    update: (v: Row) => { op = 'update'; values = v; return q },
    delete: () => { op = 'delete'; return q },
    insert: (v: Row) => {
      if (table === 'agent_audit_log' && failAudit) {
        return { then: (res: (x: unknown) => void) => res({ error: { message: 'db down' } }) }
      }
      inserts.push({ table, values: v })
      const row = { id: `new-${inserts.length}`, ...v }
      ;(tables[table] ??= []).push(row)
      return { select: () => ({ single: async () => ({ data: row, error: null }) }), then: (res: (x: unknown) => void) => res({ error: null }) }
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (x: unknown) => void) => {
      if (op === 'update') {
        allUpdates.push({ table, values })
        rows().forEach(r => Object.assign(r, values))
        return resolve({ error: null })
      }
      if (op === 'delete') {
        tables[table] = (tables[table] ?? []).filter(r => !filters.every(f => f(r)))
        return resolve({ error: null })
      }
      return resolve({ data: rows(), error: null })
    },
  }
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (t: string) => query(t) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const GOOD = 'aos_goodtoken'
const READ_ONLY = 'aos_readonly'
const REVOKED = 'aos_revoked'

beforeEach(() => {
  allUpdates.length = 0
  failAudit = false
  inserts.length = 0
  tables = {
    api_tokens: [
      { id: 't1', name: 'Grok Bot', token_hash: hashToken(GOOD), scopes: ['bookings:read', 'bookings:write', 'tasks:write', 'codes:read'], revoked_at: null },
      { id: 't2', name: 'Reader', token_hash: hashToken(READ_ONLY), scopes: ['bookings:read'], revoked_at: null },
      { id: 't3', name: 'Old', token_hash: hashToken(REVOKED), scopes: ['bookings:read'], revoked_at: '2026-01-01T00:00:00Z' },
    ],
    agent_audit_log: [],
    bookings: [
      { id: 'b-lodgify', property_id: 'p1', external_id: 'lodgify_99', ical_uid: null, check_in: '2026-10-01', check_out: '2026-10-05', gross_rental_agorot: 100000, currency: 'USD', payment_status: 'pending', is_cancelled: false },
      { id: 'b-manual', property_id: 'p1', external_id: null, ical_uid: null, check_in: '2026-10-10', check_out: '2026-10-12', gross_rental_agorot: 50000, currency: 'ILS', payment_status: 'pending', is_cancelled: false },
    ],
    booking_payments: [],
    tasks: [{ id: 'task-1', property_id: 'p1', title: 'Turnover clean', is_cleaning: true, status: 'pending', due_date: '2026-10-05', schedule_locked: false }],
    owners: [{ id: 'o1', full_name: 'Hager', email: 'hager@example.com', phone: null, profile: 'private', notes: null }],
    properties: [{ id: 'p1', name: 'Agripas 6', entry_code: '1234', building_entry_code: '9', wifi_name: 'Net', wifi_password: 'pw' }],
  }
})

function req(path: string, init: RequestInit & { token?: string | null } = {}) {
  const headers = new Headers(init.headers)
  if (init.token !== null) headers.set('authorization', `Bearer ${init.token ?? GOOD}`)
  if (init.body) headers.set('content-type', 'application/json')
  return new Request(`http://localhost/api/agent/v1${path}`, { ...init, headers })
}

describe('agent API auth', () => {
  it('401 without a token, with an unknown token, and with a revoked token', async () => {
    const { GET } = await import('../agent/v1/bookings/route')
    expect((await GET(req('/bookings', { token: null }))).status).toBe(401)
    expect((await GET(req('/bookings', { token: 'aos_nope' }))).status).toBe(401)
    expect((await GET(req('/bookings', { token: REVOKED }))).status).toBe(401)
  })

  it('403 when the token lacks the scope', async () => {
    const { PATCH } = await import('../agent/v1/bookings/[id]/route')
    const res = await PATCH(req('/bookings/b-manual', { method: 'PATCH', token: READ_ONLY, body: JSON.stringify({ notes: 'x' }) }), { params: { id: 'b-manual' } })
    expect(res.status).toBe(403)
    expect(dataUpdates()).toHaveLength(0)
  })

  it('400 with field details for invalid or unknown fields', async () => {
    const { PATCH } = await import('../agent/v1/bookings/[id]/route')
    const res = await PATCH(req('/bookings/b-manual', { method: 'PATCH', body: JSON.stringify({ checkout: '2026-10-13' }) }), { params: { id: 'b-manual' } })
    expect(res.status).toBe(400)
    expect(dataUpdates()).toHaveLength(0)
  })
})

describe('agent API bookings', () => {
  it('refuses to change dates on a Lodgify booking without force (409), and logs nothing', async () => {
    const { PATCH } = await import('../agent/v1/bookings/[id]/route')
    const res = await PATCH(req('/bookings/b-lodgify', { method: 'PATCH', body: JSON.stringify({ check_out: '2026-10-07' }) }), { params: { id: 'b-lodgify' } })
    expect(res.status).toBe(409)
    expect((await res.json()).details.source).toBe('lodgify')
    expect(dataUpdates()).toHaveLength(0)
    expect(tables.agent_audit_log).toHaveLength(0)
  })

  it('extends a manual booking and records before/after in the audit log', async () => {
    const { PATCH } = await import('../agent/v1/bookings/[id]/route')
    const res = await PATCH(req('/bookings/b-manual', { method: 'PATCH', body: JSON.stringify({ check_out: '2026-10-14' }) }), { params: { id: 'b-manual' } })
    expect(res.status).toBe(200)
    expect((await res.json()).booking.check_out).toBe('2026-10-14')
    const log = tables.agent_audit_log[0]
    expect(log).toMatchObject({ token_name: 'Grok Bot', action: 'update', resource: 'booking', resource_id: 'b-manual' })
    expect((log.before as Row).check_out).toBe('2026-10-12')
  })

  it('force=true lets a Lodgify booking be changed anyway', async () => {
    const { PATCH } = await import('../agent/v1/bookings/[id]/route')
    const res = await PATCH(req('/bookings/b-lodgify', { method: 'PATCH', body: JSON.stringify({ check_out: '2026-10-07', force: true }) }), { params: { id: 'b-lodgify' } })
    expect(res.status).toBe(200)
  })

  it('a payment updates amount_paid and payment_status, in the booking currency', async () => {
    const { POST } = await import('../agent/v1/bookings/[id]/payments/route')
    const res = await POST(req('/bookings/b-lodgify/payments', { method: 'POST', body: JSON.stringify({ amount: 400 }) }), { params: { id: 'b-lodgify' } })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.payment).toMatchObject({ amount: 400, currency: 'USD' })
    expect(body.payment_status).toBe('partial')
  })
})

describe('agent API tasks and codes', () => {
  it('moving a cleaning task locks its date so the cron leaves it alone', async () => {
    const { PATCH } = await import('../agent/v1/tasks/[id]/route')
    const res = await PATCH(req('/tasks/task-1', { method: 'PATCH', body: JSON.stringify({ due_date: '2026-10-08' }) }), { params: { id: 'task-1' } })
    expect(res.status).toBe(200)
    expect(dataUpdates()[0].values).toMatchObject({ due_date: '2026-10-08', schedule_locked: true })
  })

  it('door-code reads require codes:read and are audited', async () => {
    const { GET } = await import('../agent/v1/properties/[id]/codes/route')
    expect((await GET(req('/properties/p1/codes', { token: READ_ONLY }), { params: { id: 'p1' } })).status).toBe(403)
    const res = await GET(req('/properties/p1/codes'), { params: { id: 'p1' } })
    expect((await res.json()).codes.apartment_code).toBe('1234')
    expect(tables.agent_audit_log.at(-1)).toMatchObject({ action: 'read_codes', resource_id: 'p1' })
  })
})

describe('agent API review fixes', () => {
  it('door codes are NOT returned if the audit log write fails', async () => {
    failAudit = true
    const { GET } = await import('../agent/v1/properties/[id]/codes/route')
    const res = await GET(req('/properties/p1/codes'), { params: { id: 'p1' } })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('1234')
  })

  it("an owner's email cannot be changed through the agent (logins are keyed on it)", async () => {
    tables.api_tokens[0].scopes = ['owners:write']
    const { PATCH } = await import('../agent/v1/owners/[id]/route')
    const res = await PATCH(req('/owners/o1', { method: 'PATCH', body: JSON.stringify({ email: 'attacker@evil.test' }) }), { params: { id: 'o1' } })
    expect(res.status).toBe(400)
    expect(tables.owners[0].email).toBe('hager@example.com')
  })

  it('re-sending the same due_date (e.g. only reassigning the cleaner) does not lock the task', async () => {
    const { PATCH } = await import('../agent/v1/tasks/[id]/route')
    const res = await PATCH(req('/tasks/task-1', { method: 'PATCH', body: JSON.stringify({ due_date: '2026-10-05', contractor_id: '00000000-0000-4000-8000-000000000001' }) }), { params: { id: 'task-1' } })
    expect(res.status).toBe(200)
    expect(dataUpdates()[0].values.schedule_locked).toBeUndefined()
  })
})

describe('agent API helpers', () => {
  it('sync guard: only sync-managed fields on synced bookings are blocked', () => {
    expect(() => assertSyncSafe({ external_id: 'lodgify_1' }, { notes: 'hi' }, false)).not.toThrow()
    expect(() => assertSyncSafe({ ical_uid: 'x' }, 'delete', false)).toThrow(/sync/)
    expect(() => assertSyncSafe({ external_id: null }, { check_out: '2026-01-02' }, false)).not.toThrow()
  })

  it('converts major units and cancellation', () => {
    const row = bookingPatchToRow({ amount: 1000.5, is_cancelled: true })
    expect(row.gross_rental_agorot).toBe(100050)
    expect(row.is_cancelled).toBe(true)
    expect(row.cancelled_at).toBeTruthy()
  })

  it('payment status follows payments vs amount', () => {
    expect(derivedPaymentStatus(100000, 0)).toBe('pending')
    expect(derivedPaymentStatus(100000, 40000)).toBe('partial')
    expect(derivedPaymentStatus(100000, 100000)).toBe('complete')
    expect(derivedPaymentStatus(null, 500)).toBeNull()
  })
})
