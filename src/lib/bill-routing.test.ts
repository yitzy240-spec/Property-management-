import { describe, it, expect } from 'vitest'
import { verifyBillRouting } from './bill-routing'

const properties = [
  { id: 'prop-ariel', address: 'Agripas 6', name: 'Agripas' },
  { id: 'prop-bobbi', address: 'King George 14', name: 'King George' },
]

const utilityAccounts = [
  // Ariel's gas + water
  { id: 'ua-1', property_id: 'prop-ariel', utility_type: 'gas', account_number: 'AAA111' },
  { id: 'ua-2', property_id: 'prop-ariel', utility_type: 'water', account_number: 'WAT222' },
  // Bobbi's gas (with same digits as Ariel's water — cross-utility collision)
  { id: 'ua-3', property_id: 'prop-bobbi', utility_type: 'gas', account_number: 'WAT222' },
  // Bobbi's iec
  { id: 'ua-4', property_id: 'prop-bobbi', utility_type: 'iec', account_number: 'BOB-IEC-1' },
]

describe('verifyBillRouting', () => {
  it('account_number + utility_type match → verified', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-ariel',
      parsedPdf: { account_number: 'AAA111', bill_type: 'gas' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.signal).toBe('account_number')
    expect(result.propertyId).toBe('prop-ariel')
    expect(result.matchedAccountId).toBe('ua-1')
  })

  it('account_number matches but utility_type differs → label_only (not mismatch)', () => {
    // PDF says account WAT222 + bill_type=water. Bobbi has WAT222 but as
    // gas, not water. We must NOT promote that to a mismatch — wrong
    // utility_type means no override at all.
    const result = verifyBillRouting({
      labelPropertyId: 'prop-ariel',
      parsedPdf: { account_number: 'WAT222', bill_type: 'water' },
      utilityAccounts: [
        // Remove Ariel's water entry so the only WAT222 is Bobbi's gas.
        utilityAccounts[0],
        utilityAccounts[2],
        utilityAccounts[3],
      ],
      properties,
    })
    expect(result.confidence).toBe('label_only')
    expect(result.signal).toBe('label_only')
    expect(result.propertyId).toBe('prop-ariel')
  })

  it('account_number matches another property → mismatch (propertyId=null)', () => {
    // Label says Ariel, but the gas account number AAA111 is Ariel's
    // — modify so it points to Bobbi for this test.
    const result = verifyBillRouting({
      labelPropertyId: 'prop-ariel',
      parsedPdf: { account_number: 'BOB-IEC-1', bill_type: 'iec' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('mismatch')
    expect(result.signal).toBe('account_number')
    expect(result.propertyId).toBeNull()
    expect(result.matchedAccountId).toBe('ua-4')
  })

  it('address fuzzy match → verified', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-ariel',
      parsedPdf: { address: 'Agripas 6, Jerusalem' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.signal).toBe('address_match')
    expect(result.propertyId).toBe('prop-ariel')
  })

  it('address normalizes punctuation/whitespace before matching', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-bobbi',
      parsedPdf: { address: 'KING GEORGE  14.' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.signal).toBe('address_match')
  })

  it('no signals → label_only', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-ariel',
      parsedPdf: {},
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('label_only')
    expect(result.signal).toBe('label_only')
    expect(result.propertyId).toBe('prop-ariel')
  })

  it('account_number without bill_type → label_only (cannot verify utility_type)', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-ariel',
      parsedPdf: { account_number: 'AAA111' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('label_only')
  })

  it('unrecognized address falls through to label_only (does not promote to mismatch)', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-ariel',
      parsedPdf: { address: 'Some other street 99' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('label_only')
  })
})
