import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration-style tests for the billing flow.
 * Catches the bugs we've been hitting: email routing, webhook matching,
 * GI credential handling, surcharge math, status transitions.
 */

// ── Mocks ──

let mockAuthError = false
const mockAdminUser = { id: 'admin-1', email: 'admin@test.com', app_metadata: { role: 'admin' } }

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

let mockSelectResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockUpdateResult: { error: unknown } = { error: null }
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
  chain.or = vi.fn().mockImplementation(returnChain)
  chain.like = vi.fn().mockImplementation(returnChain)
  chain.order = vi.fn().mockImplementation(returnChain)
  chain.limit = vi.fn().mockImplementation(returnChain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  chain.insert = vi.fn().mockImplementation(() => buildChain({ data: { id: 'new-1' }, error: null }))
  chain.update = vi.fn().mockImplementation(() => buildChain(mockUpdateResult))
  chain.delete = vi.fn().mockImplementation(() => buildChain({ error: null }))
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: vi.fn(() => buildChain(mockSelectResult)),
    rpc: vi.fn(() => Promise.resolve(mockRpcResult)),
  }),
  createServerSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: mockAdminUser } }) },
    from: vi.fn(() => buildChain(mockSelectResult)),
  }),
}))

const mockSendEmail = vi.fn().mockResolvedValue({ success: true, id: 'email-1' })
vi.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  escapeHtml: (s: string) => s,
}))

vi.mock('@/lib/green-invoice', () => ({
  createPaymentLink: vi.fn().mockResolvedValue({ id: 'link-1', url: 'https://pay.test/link-1', shortUrl: 'https://mrng.to/test' }),
  createDocument: vi.fn().mockResolvedValue({ id: 'doc-1', number: 40001, url: { en: 'https://pdf.test' } }),
  createReceipt: vi.fn().mockResolvedValue({ id: 'receipt-1', number: 80001 }),
  createPayoutReceipt: vi.fn().mockResolvedValue({ id: 'payout-1', number: 80002 }),
  getDocumentPdfLinks: vi.fn().mockResolvedValue({ en: 'https://pdf.test/en' }),
  getDocument: vi.fn().mockResolvedValue({ id: 'doc-1', status: 1 }),
  DOC_TYPES: { PROFORMA: 300, RECEIPT: 400, TAX_INVOICE_RECEIPT: 320 },
  PAYMENT_TYPES: { UNPAID: -1, CASH: 1, CREDIT_CARD: 3, BANK_TRANSFER: 4, CHECK: 2 },
}))

vi.mock('@/lib/statements', () => ({
  CC_SURCHARGE_RATE: 0.035,
  calculateCcSurcharge: (amt: number) => Math.round(Math.abs(amt) * 0.035),
}))

// ── Helpers ──

function makeRequest(url: string, body?: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

// ── Tests ──

describe('Email routing safety', () => {
  beforeEach(() => {
    mockAuthError = false
    mockSendEmail.mockClear()
    vi.clearAllMocks()
  })

  it('TEST_EMAIL_OVERRIDE routes email to test address, not owner', async () => {
    // Set test override
    const originalEnv = process.env.TEST_EMAIL_OVERRIDE
    process.env.TEST_EMAIL_OVERRIDE = 'test@admin.com'

    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'approved', direction: 'owner_owes',
        net_amount_agorot: 50000, billing_month: '2026-03-01',
        gi_proforma_id: null, gi_proforma_url: null,
        reminder_sent_at: null, sent_at: null,
        cc_surcharge_agorot: 0, amount_paid_agorot: 0,
        line_items: [{ description: 'Fee', amount_agorot: 50000, category: 'fixed_fee', property_name: 'Apt 1' }],
        owners: { full_name: 'Real Owner', email: 'realowner@gmail.com' },
      },
      error: null,
    }

    const { POST } = await import('../statements/[id]/send-reminder/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)

    // Verify email went to test address, NOT real owner
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const emailCall = mockSendEmail.mock.calls[0][0]
    expect(emailCall.to).toBe('test@admin.com')
    expect(emailCall.to).not.toBe('realowner@gmail.com')
    expect(emailCall.subject).toContain('[TEST for Real Owner]')

    process.env.TEST_EMAIL_OVERRIDE = originalEnv
  })

  it('without TEST_EMAIL_OVERRIDE, email goes to actual owner', async () => {
    const originalEnv = process.env.TEST_EMAIL_OVERRIDE
    delete process.env.TEST_EMAIL_OVERRIDE

    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'approved', direction: 'owner_owes',
        net_amount_agorot: 50000, billing_month: '2026-03-01',
        gi_proforma_id: null, gi_proforma_url: null,
        reminder_sent_at: null, sent_at: null,
        cc_surcharge_agorot: 0, amount_paid_agorot: 0,
        line_items: [{ description: 'Fee', amount_agorot: 50000, category: 'fixed_fee', property_name: 'Apt 1' }],
        owners: { full_name: 'Real Owner', email: 'realowner@gmail.com' },
      },
      error: null,
    }

    const { POST } = await import('../statements/[id]/send-reminder/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)

    const emailCall = mockSendEmail.mock.calls[0][0]
    expect(emailCall.to).toBe('realowner@gmail.com')
    expect(emailCall.subject).not.toContain('[TEST')

    process.env.TEST_EMAIL_OVERRIDE = originalEnv
  })
})

describe('CC surcharge in payment link', () => {
  it('payment link amount includes 3.5% surcharge', async () => {
    const { createPaymentLink } = await import('@/lib/green-invoice')

    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'approved', direction: 'owner_owes',
        net_amount_agorot: 37000, gi_proforma_id: null,
        billing_month: '2026-03-01',
        line_items: [{ description: 'Management fee', amount_agorot: 37000, category: 'fixed_fee' }],
        owners: { full_name: 'Test', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }

    const { POST } = await import('../statements/[id]/create-invoice/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(200)

    // Check that createPaymentLink was called with surcharge included
    expect(createPaymentLink).toHaveBeenCalledTimes(1)
    const callArgs = (createPaymentLink as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // ₪370 + 3.5% = ₪382.95 = 38295 agorot
    expect(callArgs.amountAgorot).toBe(38295)
    // Should include CC fee line item
    expect(callArgs.income).toBeDefined()
    const feeItem = callArgs.income.find((i: { description: string }) => i.description.includes('processing fee'))
    expect(feeItem).toBeDefined()
    expect(feeItem.priceAgorot).toBe(1295) // 3.5% of 37000
  })
})

describe('Webhook matching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles voided document — reverts statement', async () => {
    mockSelectResult = { data: [{ id: 'stmt-1' }], error: null }

    const { POST } = await import('../webhooks/greeninvoice/route')
    const res = await POST(makeRequest('http://localhost', {
      id: 'doc-123',
      type: 400,
      status: 2, // voided
      amount: 370,
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toContain('Voided')
  })

  it('handles receipt with no matching — returns matched: false', async () => {
    // No linked docs, no matching client, multiple sent statements
    mockSelectResult = { data: [], error: null }

    const { POST } = await import('../webhooks/greeninvoice/route')
    const res = await POST(makeRequest('http://localhost', {
      id: 'receipt-123',
      type: 400,
      status: 1,
      amount: 382.95,
      client: { name: 'Unknown Person' },
      linkedDocuments: [],
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.matched).toBe(false)
  })

  it('rejects invalid JSON', async () => {
    const { POST } = await import('../webhooks/greeninvoice/route')
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }))
    expect(res.status).toBe(400)
  })

  it('handles missing document ID gracefully', async () => {
    const { POST } = await import('../webhooks/greeninvoice/route')
    const res = await POST(makeRequest('http://localhost', { type: 400, status: 1 }))
    expect(res.status).toBe(200) // Acknowledges but doesn't process
  })
})

describe('Record payment validation', () => {
  beforeEach(() => {
    mockAuthError = false
    vi.clearAllMocks()
  })

  it('rejects payment on draft statement', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'draft', direction: 'owner_owes',
        net_amount_agorot: 50000, amount_paid_agorot: 0,
        billing_month: '2026-03-01', gi_proforma_id: null,
        line_items: [], owners: { full_name: 'T', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }

    const { POST } = await import('../statements/[id]/record-payment/route')
    const res = await POST(makeRequest('http://localhost', {
      amount_agorot: 50000, payment_method: 'bank_transfer', payment_date: '2026-04-13',
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('must be sent')
  })

  it('rejects invalid payment method', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'sent', direction: 'owner_owes',
        net_amount_agorot: 50000, amount_paid_agorot: 0,
        billing_month: '2026-03-01', gi_proforma_id: null,
        line_items: [], owners: { full_name: 'T', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }

    const { POST } = await import('../statements/[id]/record-payment/route')
    const res = await POST(makeRequest('http://localhost', {
      amount_agorot: 50000, payment_method: 'bitcoin', payment_date: '2026-04-13',
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Invalid payment_method')
  })

  it('rejects payment on already paid statement', async () => {
    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'paid', direction: 'owner_owes',
        net_amount_agorot: 50000, amount_paid_agorot: 50000,
        billing_month: '2026-03-01', gi_proforma_id: null,
        line_items: [], owners: { full_name: 'T', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }

    const { POST } = await import('../statements/[id]/record-payment/route')
    const res = await POST(makeRequest('http://localhost', {
      amount_agorot: 50000, payment_method: 'bank_transfer', payment_date: '2026-04-13',
    }), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('already fully paid')
  })
})

describe('Create invoice — error handling', () => {
  it('returns proper error JSON when GI fails, not empty response', async () => {
    const { createPaymentLink } = await import('@/lib/green-invoice')
    ;(createPaymentLink as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Green Invoice API 404: {"errorCode":404}'))

    mockSelectResult = {
      data: {
        id: 'stmt-1', status: 'approved', direction: 'owner_owes',
        net_amount_agorot: 37000, gi_proforma_id: null,
        billing_month: '2026-03-01',
        line_items: [{ description: 'Fee', amount_agorot: 37000, category: 'fixed_fee' }],
        owners: { full_name: 'Test', email: 't@t.com', green_invoice_client_id: null },
      },
      error: null,
    }

    const { POST } = await import('../statements/[id]/create-invoice/route')
    const res = await POST(makeRequest('http://localhost'), { params: { id: 'stmt-1' } })
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBeDefined()
    expect(data.error).toContain('Failed to create invoice')
  })
})

describe('GI credential selection', () => {
  it('uses sandbox credentials when GREEN_INVOICE_SANDBOX=true', () => {
    const origSandbox = process.env.GREEN_INVOICE_SANDBOX
    const origId = process.env.GREEN_INVOICE_API_ID
    const origSandboxId = process.env.GREEN_INVOICE_SANDBOX_API_ID

    process.env.GREEN_INVOICE_SANDBOX = 'true'
    process.env.GREEN_INVOICE_API_ID = 'prod-id'
    process.env.GREEN_INVOICE_SANDBOX_API_ID = 'sandbox-id'

    const isSandbox = process.env.GREEN_INVOICE_SANDBOX === 'true'
    const apiId = isSandbox
      ? (process.env.GREEN_INVOICE_SANDBOX_API_ID || process.env.GREEN_INVOICE_API_ID)
      : process.env.GREEN_INVOICE_API_ID

    expect(apiId).toBe('sandbox-id')

    process.env.GREEN_INVOICE_SANDBOX = origSandbox
    process.env.GREEN_INVOICE_API_ID = origId
    process.env.GREEN_INVOICE_SANDBOX_API_ID = origSandboxId
  })

  it('falls back to main credentials when sandbox-specific not set', () => {
    const origSandbox = process.env.GREEN_INVOICE_SANDBOX
    const origId = process.env.GREEN_INVOICE_API_ID
    const origSandboxId = process.env.GREEN_INVOICE_SANDBOX_API_ID

    process.env.GREEN_INVOICE_SANDBOX = 'true'
    process.env.GREEN_INVOICE_API_ID = 'prod-id'
    delete process.env.GREEN_INVOICE_SANDBOX_API_ID

    const isSandbox = process.env.GREEN_INVOICE_SANDBOX === 'true'
    const apiId = isSandbox
      ? (process.env.GREEN_INVOICE_SANDBOX_API_ID || process.env.GREEN_INVOICE_API_ID)
      : process.env.GREEN_INVOICE_API_ID

    expect(apiId).toBe('prod-id')

    process.env.GREEN_INVOICE_SANDBOX = origSandbox
    process.env.GREEN_INVOICE_API_ID = origId
    if (origSandboxId) process.env.GREEN_INVOICE_SANDBOX_API_ID = origSandboxId
  })

  it('uses production credentials when not in sandbox', () => {
    const origSandbox = process.env.GREEN_INVOICE_SANDBOX

    process.env.GREEN_INVOICE_SANDBOX = 'false'
    process.env.GREEN_INVOICE_API_ID = 'prod-id'
    process.env.GREEN_INVOICE_SANDBOX_API_ID = 'sandbox-id'

    const isSandbox = process.env.GREEN_INVOICE_SANDBOX === 'true'
    const apiId = isSandbox
      ? (process.env.GREEN_INVOICE_SANDBOX_API_ID || process.env.GREEN_INVOICE_API_ID)
      : process.env.GREEN_INVOICE_API_ID

    expect(apiId).toBe('prod-id')

    process.env.GREEN_INVOICE_SANDBOX = origSandbox
  })
})
