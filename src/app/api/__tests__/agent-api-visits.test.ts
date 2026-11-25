import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashToken } from '@/lib/agent-api/core'

/**
 * Agent API Visits Tests — /api/agent/v1/visits/*
 * Tests CRUD operations for visit records with media management
 */

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
const allUpdates: Array<{ table: string; values: Row }> = []
const inserts: Array<{ table: string; values: Row }> = []

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select'
  let values: Row = {}
  const rows = () => (tables[table] ?? []).filter(r => filters.every(f => f(r)))
  const q: Record<string, unknown> = {
    select: () => q,
    order: () => q,
    range: () => q,
    limit: () => q,
    eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return q },
    gte: (col: string, val: unknown) => { filters.push(r => (r[col] as string) >= val); return q },
    lte: (col: string, val: unknown) => { filters.push(r => (r[col] as string) <= val); return q },
    update: (v: Row) => { op = 'update'; values = v; return q },
    delete: () => { op = 'delete'; return q },
    insert: (v: Row) => {
      inserts.push({ table, values: v })
      const row = { id: `new-${inserts.length}`, ...v }
      ;(tables[table] ??= []).push(row)
      return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
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
  createServiceClient: () => ({ 
    from: (t: string) => query(t),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://storage.example.com/${path}?signed=true` },
          error: null,
        }),
        remove: async () => ({ error: null }),
      }),
    },
    auth: {
      admin: {
        createUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
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
        scopes: ['visits:read', 'visits:write'], 
        revoked_at: null 
      },
    ],
    agent_audit_log: [],
    visits: [
      { 
        id: 'visit-1', 
        property_id: 'prop-1', 
        visited_at: '2026-11-01', 
        checklist: { electricity_working: true, run_sinks: true },
        note: 'All good',
        admin_note: 'Private note',
        created_by: 'admin-1',
        created_at: '2026-11-01T10:00:00Z',
      },
      { 
        id: 'visit-2', 
        property_id: 'prop-1', 
        visited_at: '2026-10-15', 
        checklist: { electricity_working: true },
        note: null,
        admin_note: null,
        created_by: 'admin-1',
        created_at: '2026-10-15T10:00:00Z',
      },
    ],
    visit_media: [
      {
        id: 'media-1',
        visit_id: 'visit-1',
        file_path: 'visit-media/prop-1/photo1.jpg',
        file_type: 'image',
        is_private: false,
        created_at: '2026-11-01T10:05:00Z',
      },
    ],
    properties: [
      { id: 'prop-1', name: 'Agripas 6' },
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

describe('GET /api/agent/v1/visits', () => {
  it('lists visits', async () => {
    const { GET } = await import('@/app/api/agent/v1/visits/route')
    const res = await GET(req('/visits'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.visits).toHaveLength(2)
    expect(body.visits[0].id).toBe('visit-1')
    expect(body.visits[0].property_name).toBe('Agripas 6')
  })

  it('filters by property_id', async () => {
    tables.visits.push({ 
      id: 'visit-3', 
      property_id: 'prop-2', 
      visited_at: '2026-11-02',
      checklist: {},
      note: null,
      admin_note: null,
      created_by: 'admin-1',
      created_at: '2026-11-02T10:00:00Z',
    })
    
    const { GET } = await import('@/app/api/agent/v1/visits/route')
    const res = await GET(req('/visits?property_id=prop-1'))
    const body = await res.json()
    expect(body.visits).toHaveLength(2)
    expect(body.visits.every((v: { property_id: string }) => v.property_id === 'prop-1')).toBe(true)
  })

  it('filters by date range', async () => {
    const { GET } = await import('@/app/api/agent/v1/visits/route')
    const res = await GET(req('/visits?from=2026-10-20&to=2026-11-05'))
    const body = await res.json()
    expect(body.visits).toHaveLength(1)
    expect(body.visits[0].visited_at).toBe('2026-11-01')
  })

  it('requires visits:read scope', async () => {
    tables.api_tokens[0].scopes = ['properties:read']
    const { GET } = await import('@/app/api/agent/v1/visits/route')
    const res = await GET(req('/visits'))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/agent/v1/visits', () => {
  it('creates a visit', async () => {
    const { POST } = await import('@/app/api/agent/v1/visits/route')
    const res = await POST(req('/visits', {
      method: 'POST',
      body: JSON.stringify({
        property_id: 'prop-1',
        visited_at: '2026-11-10',
        checklist: { electricity_working: true, run_sinks: true },
        note: 'All systems operational',
        admin_note: 'Private admin note',
      }),
    }))
    
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.visit.property_id).toBe('prop-1')
    expect(body.visit.visited_at).toBe('2026-11-10')
    expect(body.visit.checklist).toEqual({ electricity_working: true, run_sinks: true })
    expect(inserts).toHaveLength(1)
    expect(inserts[0].table).toBe('visits')
  })

  it('defaults visited_at to today if not provided', async () => {
    const { POST } = await import('@/app/api/agent/v1/visits/route')
    const res = await POST(req('/visits', {
      method: 'POST',
      body: JSON.stringify({
        property_id: 'prop-1',
        checklist: {},
      }),
    }))
    
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.visit.visited_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('requires visits:write scope', async () => {
    tables.api_tokens[0].scopes = ['visits:read']
    const { POST } = await import('@/app/api/agent/v1/visits/route')
    const res = await POST(req('/visits', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'prop-1' }),
    }))
    expect(res.status).toBe(403)
  })

  it('audits the create action', async () => {
    const { POST } = await import('@/app/api/agent/v1/visits/route')
    await POST(req('/visits', {
      method: 'POST',
      body: JSON.stringify({ property_id: 'prop-1', checklist: {} }),
    }))
    
    expect(inserts.some(i => i.table === 'agent_audit_log')).toBe(true)
    const auditLog = inserts.find(i => i.table === 'agent_audit_log')
    expect(auditLog?.values.resource).toBe('visit')
    expect(auditLog?.values.action).toBe('create')
  })
})

describe('GET /api/agent/v1/visits/{id}', () => {
  it('fetches visit with media and signed URLs', async () => {
    const { GET } = await import('@/app/api/agent/v1/visits/[id]/route')
    const res = await GET(req('/visits/visit-1'), { params: { id: 'visit-1' } })
    
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.visit.id).toBe('visit-1')
    expect(body.visit.media).toHaveLength(1)
    expect(body.visit.media[0].signed_url).toContain('signed=true')
  })

  it('returns 404 for non-existent visit', async () => {
    const { GET } = await import('@/app/api/agent/v1/visits/[id]/route')
    const res = await GET(req('/visits/nonexistent'), { params: { id: 'nonexistent' } })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/agent/v1/visits/{id}', () => {
  it('updates visit fields', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/visits/[id]/route')
    const res = await PATCH(req('/visits/visit-1', {
      method: 'PATCH',
      body: JSON.stringify({
        note: 'Updated note',
        admin_note: 'Updated admin note',
        checklist: { electricity_working: false },
      }),
    }), { params: { id: 'visit-1' } })
    
    expect(res.status).toBe(200)
    expect(allUpdates).toHaveLength(1)
    expect(allUpdates[0].values.note).toBe('Updated note')
    expect(allUpdates[0].values.admin_note).toBe('Updated admin note')
  })

  it('requires at least one field to update', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/visits/[id]/route')
    const res = await PATCH(req('/visits/visit-1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    }), { params: { id: 'visit-1' } })
    
    expect(res.status).toBe(400)
  })

  it('audits the update action', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/visits/[id]/route')
    await PATCH(req('/visits/visit-1', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'New note' }),
    }), { params: { id: 'visit-1' } })
    
    const auditLog = inserts.find(i => i.table === 'agent_audit_log')
    expect(auditLog?.values.action).toBe('update')
    expect(auditLog?.values.before).toBeDefined()
    expect(auditLog?.values.after).toBeDefined()
  })
})

describe('DELETE /api/agent/v1/visits/{id}', () => {
  it('deletes visit and media', async () => {
    const { DELETE } = await import('@/app/api/agent/v1/visits/[id]/route')
    const res = await DELETE(req('/visits/visit-1', { method: 'DELETE' }), { params: { id: 'visit-1' } })
    
    expect(res.status).toBe(200)
    expect(tables.visits.find(v => v.id === 'visit-1')).toBeUndefined()
  })

  it('audits the delete action', async () => {
    const { DELETE } = await import('@/app/api/agent/v1/visits/[id]/route')
    await DELETE(req('/visits/visit-1', { method: 'DELETE' }), { params: { id: 'visit-1' } })
    
    const auditLog = inserts.find(i => i.table === 'agent_audit_log')
    expect(auditLog?.values.action).toBe('delete')
    expect(auditLog?.values.before).toBeDefined()
    expect(auditLog?.values.after).toBeNull()
  })

  it('returns 404 for non-existent visit', async () => {
    const { DELETE } = await import('@/app/api/agent/v1/visits/[id]/route')
    const res = await DELETE(req('/visits/nonexistent', { method: 'DELETE' }), { params: { id: 'nonexistent' } })
    expect(res.status).toBe(404)
  })
})
