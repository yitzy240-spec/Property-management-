import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { calculateMonthlyStatements, calculateCcSurcharge, CC_SURCHARGE_RATE } from './statements'

function buildMockClient(tables: Record<string, unknown[]>) {
  const client = {
    from: vi.fn((table: string) => {
      const data = tables[table] ?? []
      const chain: Record<string, unknown> = {}
      const returnChain = () => chain
      chain.select = vi.fn().mockImplementation(returnChain)
      chain.eq = vi.fn().mockImplementation(returnChain)
      chain.gte = vi.fn().mockImplementation(returnChain)
      chain.lte = vi.fn().mockImplementation(returnChain)
      chain.in = vi.fn().mockImplementation(returnChain)
      chain.order = vi.fn().mockImplementation(returnChain)
      chain.limit = vi.fn().mockImplementation(returnChain)
      chain.then = (resolve: (v: unknown) => void) => resolve({ data, error: null })
      Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' })
      return chain
    }),
  }
  return client
}

describe('Statement Calculator', () => {
  const billingMonth = '2026-04-01'

  it('direct booking: rental credit + commission in fees', async () => {
    const client = buildMockClient({
      owners: [{ id: 'o1', full_name: 'Test', email: 't@test.com', green_invoice_client_id: null }],
      properties: [{ id: 'p1', owner_id: 'o1', name: 'Apt A', commission_rate: 0.20, management_fee_agorot: 50000, hourly_rate_agorot: 15000, is_active: true }],
      bookings: [{ id: 'b1', property_id: 'p1', platform: 'direct', gross_rental_agorot: 300000, guest_name: 'Guest 1', check_in: '2026-04-01', check_out: '2026-04-05' }],
      work_logs: [{ id: 'w1', property_id: 'p1', hours: 2, description: 'Repair faucet', date: '2026-04-10', billable: true }],
      bills: [{ id: 'bill1', property_id: 'p1', bill_type: 'arnona', amount_agorot: 80000, due_date: '2026-04-15', status: 'approved', payment_method: 'paid_by_admin', approved_at: '2026-04-10T10:00:00Z' }],
    })

    const results = await calculateMonthlyStatements(client as never, billingMonth)
    const stmt = results[0]

    expect(stmt.grossRentalAgorot).toBe(300000)
    expect(stmt.commissionAgorot).toBe(60000) // 300000 * 0.20
    expect(stmt.hourlyChargesAgorot).toBe(30000) // 2h * 15000
    expect(stmt.fixedFeeAgorot).toBe(50000)
    expect(stmt.billsPaidAgorot).toBe(80000)
    // Net = (60000 + 30000 + 50000 + 80000) - 300000 = -80000
    expect(stmt.netAmountAgorot).toBe(-80000)
    expect(stmt.direction).toBe('marcus_owes')

    // Check sections
    const bookingsItems = stmt.lineItems.filter(i => i.section === 'bookings')
    const feesItems = stmt.lineItems.filter(i => i.section === 'fees')
    const incidentalsItems = stmt.lineItems.filter(i => i.section === 'incidentals')

    expect(bookingsItems).toHaveLength(1) // rental
    expect(bookingsItems[0].category).toBe('rental_direct')
    expect(bookingsItems[0].amount_agorot).toBe(-300000)

    expect(feesItems).toHaveLength(3) // commission + fixed + hourly
    expect(feesItems.find(i => i.category === 'commission_direct')?.amount_agorot).toBe(60000)
    expect(feesItems.find(i => i.category === 'fixed_fee')?.amount_agorot).toBe(50000)
    expect(feesItems.find(i => i.category === 'hourly')?.amount_agorot).toBe(30000)

    expect(incidentalsItems).toHaveLength(1) // bill
    expect(incidentalsItems[0].amount_agorot).toBe(80000)
  })

  it('airbnb booking: commission only in bookings section, no rental credit', async () => {
    const client = buildMockClient({
      owners: [{ id: 'o1', full_name: 'Airbnb Owner', email: 'a@test.com', green_invoice_client_id: null }],
      properties: [{ id: 'p1', owner_id: 'o1', name: 'Apt', commission_rate: 0.20, management_fee_agorot: 0, hourly_rate_agorot: 0, is_active: true }],
      bookings: [{ id: 'b1', property_id: 'p1', platform: 'airbnb', gross_rental_agorot: 500000, guest_name: 'Airbnb Guest', check_in: '2026-04-01', check_out: '2026-04-05' }],
      work_logs: [],
      bills: [],
    })

    const results = await calculateMonthlyStatements(client as never, billingMonth)
    const stmt = results[0]

    expect(stmt.grossRentalAgorot).toBe(0) // No rental through Marcus
    expect(stmt.commissionAgorot).toBe(100000) // 500000 * 0.20
    expect(stmt.netAmountAgorot).toBe(100000) // Owner owes commission
    expect(stmt.direction).toBe('owner_owes')

    // Commission appears in bookings section (not fees) for platform bookings
    const bookingsItems = stmt.lineItems.filter(i => i.section === 'bookings')
    expect(bookingsItems).toHaveLength(1)
    expect(bookingsItems[0].category).toBe('commission_platform')
    expect(bookingsItems[0].description).toContain('airbnb')
    expect(bookingsItems[0].description).toContain('commission')

    // No rental_direct items
    expect(stmt.lineItems.filter(i => i.category === 'rental_direct')).toHaveLength(0)
  })

  it('mixed direct + airbnb bookings', async () => {
    const client = buildMockClient({
      owners: [{ id: 'o1', full_name: 'Mix', email: 'm@test.com', green_invoice_client_id: null }],
      properties: [{ id: 'p1', owner_id: 'o1', name: 'Apt', commission_rate: 0.20, management_fee_agorot: 0, hourly_rate_agorot: 0, is_active: true }],
      bookings: [
        { id: 'b1', property_id: 'p1', platform: 'direct', gross_rental_agorot: 300000, guest_name: 'Direct', check_in: '2026-04-01', check_out: '2026-04-03' },
        { id: 'b2', property_id: 'p1', platform: 'airbnb', gross_rental_agorot: 200000, guest_name: 'Airbnb', check_in: '2026-04-05', check_out: '2026-04-08' },
      ],
      work_logs: [],
      bills: [],
    })

    const results = await calculateMonthlyStatements(client as never, billingMonth)
    const stmt = results[0]

    expect(stmt.grossRentalAgorot).toBe(300000) // Only direct
    expect(stmt.commissionAgorot).toBe(100000) // Both: 60000 + 40000
    expect(stmt.netAmountAgorot).toBe(-200000) // 100000 - 300000
    expect(stmt.direction).toBe('marcus_owes')
  })

  it('owner_stay bookings are skipped', async () => {
    const client = buildMockClient({
      owners: [{ id: 'o1', full_name: 'Stay', email: 's@test.com', green_invoice_client_id: null }],
      properties: [{ id: 'p1', owner_id: 'o1', name: 'Apt', commission_rate: 0.20, management_fee_agorot: 50000, hourly_rate_agorot: 0, is_active: true }],
      bookings: [{ id: 'b1', property_id: 'p1', platform: 'owner_stay', gross_rental_agorot: null, guest_name: 'Owner', check_in: '2026-04-01', check_out: '2026-04-05' }],
      work_logs: [],
      bills: [],
    })

    const results = await calculateMonthlyStatements(client as never, billingMonth)
    expect(results[0].grossRentalAgorot).toBe(0)
    expect(results[0].commissionAgorot).toBe(0)
    expect(results[0].fixedFeeAgorot).toBe(50000)
    expect(results[0].direction).toBe('owner_owes')
  })

  it('skips owners with no activity', async () => {
    const client = buildMockClient({
      owners: [
        { id: 'o1', full_name: 'Active', email: 'a@t.com', green_invoice_client_id: null },
        { id: 'o2', full_name: 'Idle', email: 'b@t.com', green_invoice_client_id: null },
      ],
      properties: [
        { id: 'p1', owner_id: 'o1', name: 'Apt A', commission_rate: 0.20, management_fee_agorot: 0, hourly_rate_agorot: 0, is_active: true },
        { id: 'p2', owner_id: 'o2', name: 'Apt B', commission_rate: 0.20, management_fee_agorot: 0, hourly_rate_agorot: 0, is_active: true },
      ],
      bookings: [{ id: 'b1', property_id: 'p1', platform: 'direct', gross_rental_agorot: 200000, guest_name: 'G', check_in: '2026-04-01', check_out: '2026-04-05' }],
      work_logs: [],
      bills: [],
    })

    const results = await calculateMonthlyStatements(client as never, billingMonth)
    expect(results).toHaveLength(1)
    expect(results[0].ownerName).toBe('Active')
  })

  it('multiple properties grouped correctly', async () => {
    const client = buildMockClient({
      owners: [{ id: 'o1', full_name: 'Multi', email: 'm@t.com', green_invoice_client_id: null }],
      properties: [
        { id: 'p1', owner_id: 'o1', name: 'Apt 1', commission_rate: 0.20, management_fee_agorot: 30000, hourly_rate_agorot: 0, is_active: true },
        { id: 'p2', owner_id: 'o1', name: 'Apt 2', commission_rate: 0.15, management_fee_agorot: 40000, hourly_rate_agorot: 0, is_active: true },
      ],
      bookings: [
        { id: 'b1', property_id: 'p1', platform: 'direct', gross_rental_agorot: 100000, guest_name: 'G1', check_in: '2026-04-01', check_out: '2026-04-03' },
        { id: 'b2', property_id: 'p2', platform: 'direct', gross_rental_agorot: 150000, guest_name: 'G2', check_in: '2026-04-05', check_out: '2026-04-10' },
      ],
      work_logs: [],
      bills: [],
    })

    const results = await calculateMonthlyStatements(client as never, billingMonth)
    const stmt = results[0]
    const propertyNames = [...new Set(stmt.lineItems.map(li => li.property_name))]
    expect(propertyNames).toContain('Apt 1')
    expect(propertyNames).toContain('Apt 2')

    // Each property has its own items
    const apt1Items = stmt.lineItems.filter(i => i.property_name === 'Apt 1')
    const apt2Items = stmt.lineItems.filter(i => i.property_name === 'Apt 2')
    expect(apt1Items.length).toBeGreaterThanOrEqual(2) // rental + commission + fee
    expect(apt2Items.length).toBeGreaterThanOrEqual(2)
  })

  it('zero net when commission equals rental', async () => {
    const client = buildMockClient({
      owners: [{ id: 'o1', full_name: 'Even', email: 'e@t.com', green_invoice_client_id: null }],
      properties: [{ id: 'p1', owner_id: 'o1', name: 'Apt', commission_rate: 1.0, management_fee_agorot: 0, hourly_rate_agorot: 0, is_active: true }],
      bookings: [{ id: 'b1', property_id: 'p1', platform: 'direct', gross_rental_agorot: 100000, guest_name: 'G', check_in: '2026-04-01', check_out: '2026-04-03' }],
      work_logs: [],
      bills: [],
    })

    const results = await calculateMonthlyStatements(client as never, billingMonth)
    expect(results[0].netAmountAgorot).toBe(0)
    expect(results[0].direction).toBe('zero')
  })
})

describe('CC Surcharge', () => {
  it('calculates 3.5%', () => {
    expect(calculateCcSurcharge(500000)).toBe(17500)
    expect(calculateCcSurcharge(100000)).toBe(3500)
  })

  it('uses absolute value', () => {
    expect(calculateCcSurcharge(-500000)).toBe(17500)
  })

  it('rounds correctly', () => {
    expect(calculateCcSurcharge(33333)).toBe(1167)
  })

  it('exports correct rate', () => {
    expect(CC_SURCHARGE_RATE).toBe(0.035)
  })
})
