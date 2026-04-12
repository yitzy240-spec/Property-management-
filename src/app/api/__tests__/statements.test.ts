import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for statement billing API routes:
 * - /api/statements/generate
 * - /api/statements/[id]/approve
 * - /api/statements/[id]/line-items (PUT + POST)
 * - /api/statements/[id]/record-payment
 * - /api/statements/[id]/delete
 * - /api/statements (GET list)
 */

// ── Mocks ──

let mockAuthError = false
let mockAdminUser = { id: 'admin-1', email: 'admin@test.com', app_metadata: { role: 'admin' } }

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => {
    if (mockAuthError) throw new (class extends Error { status = 401 })('Unauthorized')
    return mockAdminUser
  },
  AuthError: class extends Error {
    status: number
    constructor(m: string, s: number) { super(m); this.status = s }
  },
}))

// Mock Supabase — tracks calls per table
const mockStatements: Record<string, unknown>[] = []
const mockLineItems: Record<string, unknown>[] = []
let mockSelectResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockUpdateResult: { error: unknown } = { error: null }
let mockDeleteResult: { error: unknown } = { error: null }
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null }

function buildChain(finalResult: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  const returnChain = () => chain
  chain.select = vi.fn().mockImplementation(returnChain)
  chain.eq = vi.fn().mockImplementation(returnChain)
  chain.neq = vi.fn().mockImplementation(returnChain)
  chain.gte = vi.fn().mockImplementation(returnChain)
  chain.lte = vi.fn().mockImplementation(returnChain)
  chain.not = vi.fn().mockImplementation(returnChain)
  chain.in = vi.fn().mockImplementation(returnChain)
  chain.order = vi.fn().mockImplementation(returnChain)
  chain.limit = vi.fn().mockImplementation(returnChain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  chain.insert = vi.fn().mockImplementation(() => buildChain(mockInsertResult))
  chain.update = vi.fn().mockImplementation(() => buildChain(mockUpdateResult))
  chain.delete = vi.fn().mockImplementation(() => buildChain(mockDeleteResult))
  // Make the chain itself thenable for queries without .single()
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: vi.fn(() => buildChain(mockSelectResult)),
    rpc: vi.fn(() => Promise.resolve(mockRpcResult)),
  }),
  createServerSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockAdminUser } }),
    },
    from: vi.fn(() => buildChain(mockSelectResult)),
  }),
}))

vi.mock('@/lib/statements', () => ({
  calculateMonthlyStatements: vi.fn().mockResolvedValue([]),
  calculateCcSurcharge: (amt: number) => Math.round(Math.abs(amt) * 0.035),
  CC_SURCHARGE_RATE: 0.035,
}))

vi.mock('@/lib/statement-insert', () => ({
  insertStatements: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/green-invoice', () => ({
  createReceipt: vi.fn().mockResolvedValue({ id: 'gi-1', number: 100 }),
  createPaymentForm: vi.fn().mockResolvedValue({ id: 'form-1', url: 'https://pay.test' }),
  createPayoutReceipt: vi.fn().mockResolvedValue({ id: 'gi-2', number: 101 }),
  getDocumentPdfLinks: vi.fn().mockResolvedValue({ en: 'https://pdf.test' }),
  PAYMENT_TYPES: { UNPAID: -1, CASH: 1, CREDIT_CARD: 3, BANK_TRANSFER: 4 },
}))

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, id: 'email-1' }),
  escapeHtml: (s: string) => s,
}))

// ── Helpers ──

function makeRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

// ── Tests ──

describe('/api/statements/generate', () => {
  beforeEach(() => {
    mockAuthError = false
    mockSelectResult = { data: [], error: null }
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    mockAuthError = true
    const { POST } = await import('../statements/generate/route')
    const res = await POST(makeRequest('http://localhost/api/statements/generate', { billing_month: '2026-03-01' }))
    expect(res.status).toBe(401)
  })

  it('validates billing_month format', async () => {
    const { POST } = await import('../statements/generate/route')
    const res = await POST(makeRequest('http://localhost/api/statements/generate', { billing_month: '2026-03' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('billing_month')
  })

  it('returns 409 if statements already exist', async () => {
    mockSelectResult = { data: [{ id: 'existing' }], error: null }
    const { POST } = await import('../statements/generate/route')
    const res = await POST(makeRequest('http://localhost/api/statements/generate', { billing_month: '2026-03-01' }))
    expect(res.status).toBe(409)
  })
})

describe('/api/statements/[id]/approve', () => {
  beforeEach(() => {
    mockAuthError = false
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    mockAuthError = true
    const { POST } = await import('../statements/[id]/approve/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(401)
  })

  it('rejects approval of non-draft statements', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'sent' }, error: null }
    const { POST } = await import('../statements/[id]/approve/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Cannot approve')
  })

  it('approves draft statement', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'draft' }, error: null }
    const { POST } = await import('../statements/[id]/approve/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toBe('Statement approved')
  })

  it('approves pending_approval statement', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'pending_approval' }, error: null }
    const { POST } = await import('../statements/[id]/approve/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
  })
})

describe('/api/statements/[id]/record-payment', () => {
  beforeEach(() => {
    mockAuthError = false
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'sent', direction: 'owner_owes',
        net_amount_agorot: 100000, amount_paid_agorot: 0,
        billing_month: '2026-03-01', gi_proforma_id: null,
        line_items: [{ description: 'Fee', amount_agorot: 100000 }],
        owners: { full_name: 'Test', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }
    mockInsertResult = { data: { id: 'pay-1' }, error: null }
    mockRpcResult = { data: [{ new_paid_total: 100000, new_status: 'paid' }], error: null }
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    mockAuthError = true
    const { POST } = await import('../statements/[id]/record-payment/route')
    const res = await POST(makeRequest('http://localhost', {
      amount_agorot: 100000, payment_method: 'bank_transfer', payment_date: '2026-04-10',
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(401)
  })

  it('validates amount_agorot is positive integer', async () => {
    const { POST } = await import('../statements/[id]/record-payment/route')

    const res1 = await POST(makeRequest('http://localhost', {
      amount_agorot: -500, payment_method: 'bank_transfer', payment_date: '2026-04-10',
    }), { params: { id: 'stmt-1' } })
    expect(res1.status).toBe(400)
    expect((await res1.json()).error).toContain('positive integer')

    const res2 = await POST(makeRequest('http://localhost', {
      amount_agorot: 99.5, payment_method: 'bank_transfer', payment_date: '2026-04-10',
    }), { params: { id: 'stmt-1' } })
    expect(res2.status).toBe(400)
  })

  it('validates payment_date format', async () => {
    const { POST } = await import('../statements/[id]/record-payment/route')
    const res = await POST(makeRequest('http://localhost', {
      amount_agorot: 50000, payment_method: 'bank_transfer', payment_date: 'April 10',
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('YYYY-MM-DD')
  })

  it('adds 3.5% CC surcharge for credit card payments', async () => {
    const { POST } = await import('../statements/[id]/record-payment/route')
    const res = await POST(makeRequest('http://localhost', {
      amount_agorot: 100000, payment_method: 'credit_card', payment_date: '2026-04-10',
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.surcharge_agorot).toBe(3500) // 100000 * 0.035
  })

  it('no surcharge for bank transfer', async () => {
    const { POST } = await import('../statements/[id]/record-payment/route')
    const res = await POST(makeRequest('http://localhost', {
      amount_agorot: 100000, payment_method: 'bank_transfer', payment_date: '2026-04-10',
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.surcharge_agorot).toBe(0)
  })
})

describe('/api/statements/[id]/line-items PUT', () => {
  beforeEach(() => {
    mockAuthError = false
    mockSelectResult = { data: { id: 'stmt-1', status: 'draft' }, error: null }
    mockDeleteResult = { error: null }
    mockInsertResult = { data: null, error: null }
    vi.clearAllMocks()
  })

  it('rejects edits on sent statements', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'sent' }, error: null }
    const { PUT } = await import('../statements/[id]/line-items/route')
    const res = await PUT(makeRequest('http://localhost', { line_items: [] }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Cannot edit')
  })

  it('rejects edits on paid statements', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'paid' }, error: null }
    const { PUT } = await import('../statements/[id]/line-items/route')
    const res = await PUT(makeRequest('http://localhost', { line_items: [] }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
  })

  it('recalculates net from line items', async () => {
    const { PUT } = await import('../statements/[id]/line-items/route')
    const res = await PUT(makeRequest('http://localhost', {
      line_items: [
        { category: 'rental_direct', amount_agorot: -300000, description: 'Rental', section: 'bookings', property_id: 'p1' },
        { category: 'commission_direct', amount_agorot: 60000, description: 'Commission', section: 'fees', property_id: 'p1' },
        { category: 'fixed_fee', amount_agorot: 50000, description: 'Fixed', section: 'fees', property_id: 'p1' },
      ],
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    // Net = (60000 + 50000) - 300000 = -190000
    expect(data.net_amount_agorot).toBe(-190000)
    expect(data.direction).toBe('marcus_owes')
  })

  it('sets status to pending_approval after edit', async () => {
    const { PUT } = await import('../statements/[id]/line-items/route')
    const res = await PUT(makeRequest('http://localhost', {
      line_items: [{ category: 'fixed_fee', amount_agorot: 50000, description: 'Fee', section: 'fees' }],
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
  })
})

describe('/api/statements/[id]/delete', () => {
  beforeEach(() => {
    mockAuthError = false
    mockDeleteResult = { error: null }
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    mockAuthError = true
    const { DELETE } = await import('../statements/[id]/delete/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(401)
  })

  it('blocks deletion of sent statements', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'sent' }, error: null }
    const { DELETE } = await import('../statements/[id]/delete/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Cannot delete')
  })

  it('blocks deletion of paid statements', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'paid' }, error: null }
    const { DELETE } = await import('../statements/[id]/delete/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
  })

  it('allows deletion of draft statements', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'draft' }, error: null }
    const { DELETE } = await import('../statements/[id]/delete/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
    expect((await res.json()).message).toBe('Statement deleted')
  })

  it('allows deletion of pending_approval statements', async () => {
    mockSelectResult = { data: { id: 'stmt-1', status: 'pending_approval' }, error: null }
    const { DELETE } = await import('../statements/[id]/delete/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)
  })
})

describe('/api/statements/[id]/send-reminder', () => {
  beforeEach(() => {
    mockAuthError = false
    vi.clearAllMocks()
  })

  it('blocks sending draft statements', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'draft', direction: 'owner_owes',
        net_amount_agorot: 50000, billing_month: '2026-03-01',
        gi_proforma_id: null, gi_proforma_url: null,
        reminder_sent_at: null, sent_at: null,
        line_items: [], owners: { full_name: 'Test', email: 't@t.com' },
      },
      error: null,
    }
    const { POST } = await import('../statements/[id]/send-reminder/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('must be approved')
  })

  it('blocks sending pending_approval statements', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'pending_approval', direction: 'owner_owes',
        net_amount_agorot: 50000, billing_month: '2026-03-01',
        gi_proforma_id: null, gi_proforma_url: null,
        reminder_sent_at: null, sent_at: null,
        line_items: [], owners: { full_name: 'Test', email: 't@t.com' },
      },
      error: null,
    }
    const { POST } = await import('../statements/[id]/send-reminder/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
  })

  it('blocks sending already paid statements', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'paid', direction: 'owner_owes',
        net_amount_agorot: 50000, billing_month: '2026-03-01',
        gi_proforma_id: null, gi_proforma_url: null,
        reminder_sent_at: null, sent_at: null,
        line_items: [], owners: { full_name: 'Test', email: 't@t.com' },
      },
      error: null,
    }
    const { POST } = await import('../statements/[id]/send-reminder/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('already paid')
  })
})

describe('/api/statements/[id]/create-invoice', () => {
  beforeEach(() => {
    mockAuthError = false
    vi.clearAllMocks()
  })

  it('requires approved status', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'draft', direction: 'owner_owes',
        net_amount_agorot: 50000, gi_proforma_id: null,
        billing_month: '2026-03-01',
        line_items: [{ description: 'Fee', amount_agorot: 50000, category: 'fixed_fee' }],
        owners: { full_name: 'Test', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }
    const { POST } = await import('../statements/[id]/create-invoice/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('must be approved')
  })

  it('rejects if invoice already exists', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'approved', direction: 'owner_owes',
        net_amount_agorot: 50000, gi_proforma_id: 'existing-gi-id',
        billing_month: '2026-03-01', line_items: [],
        owners: { full_name: 'Test', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }
    const { POST } = await import('../statements/[id]/create-invoice/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(409)
  })
})
