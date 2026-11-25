import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashToken } from '@/lib/agent-api/core'

/**
 * Agent API Properties PATCH Tests — /api/agent/v1/properties/{id}
 * Tests property field updates matching web UI capabilities
 */

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
const allUpdates: Array<{ table: string; values: Row }> = []
/** Data writes only — excludes the api_tokens.last_used_at bookkeeping. */
const dataUpdates = () => allUpdates.filter(u => u.table !== 'api_tokens')
const inserts: Array<{ table: string; values: Row }> = []

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select'
  let values: Row = {}
  const rows = () => (tables[table] ?? []).filter(r => filters.every(f => f(r)))
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return q },
    update: (v: Row) => { op = 'update'; values = v; return q },
    insert: (v: Row) => {
      inserts.push({ table, values: v })
      const row = { id: `new-${inserts.length}`, ...v }
      ;(tables[table] ??= []).push(row)
      return { then: (res: (x: unknown) => void) => res({ error: null }) }
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (x: unknown) => void) => {
      if (op === 'update') {
        allUpdates.push({ table, values })
        rows().forEach(r => Object.assign(r, values))
        return resolve({ error: null })
      }
      return resolve({ data: rows(), error: null })
    },
  }
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ 
    from: (t: string) => query(t),
    auth: {
      admin: {
        createUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }),
      },
    },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const GOOD_TOKEN = 'aos_goodtoken'

beforeEach(() => {
  allUpdates.length = 0
  inserts.length = 0
  tables = {
    api_tokens: [
      { 
        id: 't1', 
        name: 'Test Token', 
        token_hash: hashToken(GOOD_TOKEN), 
        scopes: ['properties:read', 'properties:write'], 
        revoked_at: null 
      },
    ],
    agent_audit_log: [],
    properties: [
      { 
        id: 'prop-1',
        name: 'Agripas 6',
        address: '6 Agripas St',
        city: 'Jerusalem',
        neighborhood: 'City Center',
        num_bedrooms: 2,
        num_beds: 3,
        entry_code: '1234',
        building_entry_code: '9',
        youtube_tutorial_url: null,
        canva_design_url: null,
        entry_instructions: null,
        wifi_name: 'WiFi-Network',
        wifi_password: 'password123',
        owner_id: 'owner-1',
        commission_rate: 0.20,
        management_fee_agorot: 100000,
        hourly_rate_agorot: 15000,
        lodgify_property_id: null,
        is_active: true,
        owners: { full_name: 'Test Owner' },
      },
    ],
    'auth.users': [
      { id: 'admin-1', raw_app_meta_data: { role: 'admin' } },
    ],
  }
})

function req(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.token !== null) headers.set('authorization', `Bearer ${init.token ?? GOOD_TOKEN}`)
  if (init.body) headers.set('content-type', 'application/json')
  return new Request(`http://localhost/api/agent/v1${path}`, { ...init, headers })
}

describe('PATCH /api/agent/v1/properties/{id}', () => {
  it('updates basic property fields', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Agripas 6 Updated',
        address: '6A Agripas Street',
        city: 'Jerusalem',
      }),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(200)
    expect(dataUpdates()).toHaveLength(1)
    expect(dataUpdates()[0].values.name).toBe('Agripas 6 Updated')
    expect(dataUpdates()[0].values.address).toBe('6A Agripas Street')
  })

  it('updates entry codes and wifi', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({
        entry_code: '5678',
        building_entry_code: '42',
        wifi_name: 'New-WiFi',
        wifi_password: 'newpassword',
      }),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.property).toBeDefined()
    expect(dataUpdates()[0].values.entry_code).toBe('5678')
  })

  it('updates financial rates (converts ILS to agorot)', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({
        commission_rate: 0.25,
        management_fee_ils: 1500,
        hourly_rate_ils: 200,
      }),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(200)
    expect(dataUpdates()[0].values.commission_rate).toBe(0.25)
    expect(dataUpdates()[0].values.management_fee_agorot).toBe(150000)
    expect(dataUpdates()[0].values.hourly_rate_agorot).toBe(20000)
  })

  it('updates property with nullable fields', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({
        youtube_tutorial_url: 'https://youtube.com/watch?v=xyz',
        entry_instructions: 'Take elevator to floor 3',
        neighborhood: null,
      }),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(200)
    expect(dataUpdates()[0].values.youtube_tutorial_url).toBe('https://youtube.com/watch?v=xyz')
    expect(dataUpdates()[0].values.entry_instructions).toBe('Take elevator to floor 3')
    expect(dataUpdates()[0].values.neighborhood).toBeNull()
  })

  it('requires at least one field to update', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(400)
  })

  it('requires properties:write scope', async () => {
    tables.api_tokens[0].scopes = ['properties:read']
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent property', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/nonexistent', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Test' }),
    }), { params: { id: 'nonexistent' } })
    
    expect(res.status).toBe(404)
  })

  it('audits the update action with before/after', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
    }), { params: { id: 'prop-1' } })
    
    const auditLog = inserts.find(i => i.table === 'agent_audit_log')
    expect(auditLog).toBeDefined()
    expect(auditLog?.values.action).toBe('update')
    expect(auditLog?.values.resource).toBe('property')
    expect(auditLog?.values.before).toBeDefined()
    expect(auditLog?.values.after).toBeDefined()
  })

  it('validates field types', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({
        num_bedrooms: 'invalid',
      }),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(400)
  })

  it('rejects unknown fields', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/properties/[id]/route')
    const res = await PATCH(req('/properties/prop-1', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Test',
        unknown_field: 'value',
      }),
    }), { params: { id: 'prop-1' } })
    
    expect(res.status).toBe(400)
  })
})
