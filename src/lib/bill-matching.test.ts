import { describe, it, expect } from 'vitest'

/**
 * Tests for bill-to-property matching logic.
 * Validates the matching pipeline: sender mapping → account number → owner name → address.
 */

interface Owner {
  id: string
  full_name: string
}

interface Property {
  id: string
  owner_id: string
  address: string
}

interface SenderMapping {
  sender_email: string
  bill_type: string
  property_id: string
}

interface UtilityAccount {
  property_id: string
  utility_type: string
  account_number: string
}

function matchBillToProperty(
  senderEmail: string,
  billType: string,
  aiData: { account_number?: string; account_holder?: string; address?: string } | null,
  subject: string,
  senderMappings: SenderMapping[],
  utilityAccounts: UtilityAccount[],
  owners: Owner[],
  properties: Property[],
): { propertyId: string | null; method: string | null } {
  // 1. Learned sender mappings
  const mapping = senderMappings.find(
    m => m.sender_email === senderEmail && m.bill_type === billType
  )
  if (mapping) return { propertyId: mapping.property_id, method: 'learned_mapping' }

  // 2. Account number
  if (aiData?.account_number) {
    const match = utilityAccounts.find(
      ua => ua.utility_type === billType && ua.account_number === aiData.account_number
    )
    if (match) return { propertyId: match.property_id, method: 'account_number' }
  }

  // 3. Owner name
  const searchText = `${subject} ${aiData?.account_holder || ''}`.toLowerCase()
  for (const owner of owners) {
    const parts = owner.full_name.toLowerCase().split(' ')
    const allMatch = parts.length >= 2 && parts.every(p => p.length > 2 && searchText.includes(p))
    if (allMatch) {
      const prop = properties.find(p => p.owner_id === owner.id)
      if (prop) return { propertyId: prop.id, method: 'owner_name' }
    }
  }

  // 4. Address
  if (aiData?.address) {
    const addr = aiData.address.toLowerCase()
    const match = properties.find(p =>
      addr.includes(p.address.toLowerCase()) || p.address.toLowerCase().includes(addr)
    )
    if (match) return { propertyId: match.id, method: 'address' }
  }

  return { propertyId: null, method: null }
}

const testOwners: Owner[] = [
  { id: 'owner-1', full_name: 'Ariel Marcus' },
  { id: 'owner-2', full_name: 'Dena Finkelstein' },
]

const testProperties: Property[] = [
  { id: 'prop-1', owner_id: 'owner-1', address: 'Agripas 6' },
  { id: 'prop-2', owner_id: 'owner-2', address: 'Keren Hayesod 5' },
]

describe('Bill-to-Property Matching', () => {
  it('matches by learned sender mapping', () => {
    const result = matchBillToProperty(
      'bills@iec.co.il', 'iec', null, 'Your electricity bill',
      [{ sender_email: 'bills@iec.co.il', bill_type: 'iec', property_id: 'prop-1' }],
      [], testOwners, testProperties
    )
    expect(result.propertyId).toBe('prop-1')
    expect(result.method).toBe('learned_mapping')
  })

  it('matches by utility account number', () => {
    const result = matchBillToProperty(
      'unknown@util.co.il', 'water', { account_number: '12345' }, 'Water bill',
      [],
      [{ property_id: 'prop-2', utility_type: 'water', account_number: '12345' }],
      testOwners, testProperties
    )
    expect(result.propertyId).toBe('prop-2')
    expect(result.method).toBe('account_number')
  })

  it('matches by owner name in subject', () => {
    const result = matchBillToProperty(
      'unknown@util.co.il', 'arnona', null, 'Arnona bill for Ariel Marcus',
      [], [], testOwners, testProperties
    )
    expect(result.propertyId).toBe('prop-1')
    expect(result.method).toBe('owner_name')
  })

  it('matches by owner name in AI-extracted account holder', () => {
    const result = matchBillToProperty(
      'unknown@util.co.il', 'gas', { account_holder: 'Dena Finkelstein' }, 'Gas bill',
      [], [], testOwners, testProperties
    )
    expect(result.propertyId).toBe('prop-2')
    expect(result.method).toBe('owner_name')
  })

  it('matches by address', () => {
    const result = matchBillToProperty(
      'unknown@util.co.il', 'water', { address: 'Keren Hayesod 5, Jerusalem' }, 'Bill',
      [], [], testOwners, testProperties
    )
    expect(result.propertyId).toBe('prop-2')
    expect(result.method).toBe('address')
  })

  it('returns null when no match found', () => {
    const result = matchBillToProperty(
      'random@gmail.com', 'other', null, 'Random email',
      [], [], testOwners, testProperties
    )
    expect(result.propertyId).toBeNull()
    expect(result.method).toBeNull()
  })

  it('prioritizes sender mapping over account number', () => {
    const result = matchBillToProperty(
      'bills@iec.co.il', 'iec', { account_number: '99999' }, 'Bill',
      [{ sender_email: 'bills@iec.co.il', bill_type: 'iec', property_id: 'prop-1' }],
      [{ property_id: 'prop-2', utility_type: 'iec', account_number: '99999' }],
      testOwners, testProperties
    )
    expect(result.propertyId).toBe('prop-1')
    expect(result.method).toBe('learned_mapping')
  })

  it('does not match short name parts', () => {
    const owners = [{ id: 'owner-3', full_name: 'Li Yu' }]
    const props = [{ id: 'prop-3', owner_id: 'owner-3', address: 'Test St' }]
    const result = matchBillToProperty(
      'x@y.com', 'other', null, 'Something with Li and Yu in it',
      [], [], owners, props
    )
    // "Li" and "Yu" are <= 2 chars, should not match
    expect(result.propertyId).toBeNull()
  })
})
