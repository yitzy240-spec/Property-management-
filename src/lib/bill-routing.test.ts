import { describe, it, expect } from 'vitest'
import { verifyBillRouting, resolveBillRoutingWithoutLabel } from './bill-routing'

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

describe('resolveBillRoutingWithoutLabel', () => {
  it('account_number + utility_type match → verified', () => {
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: { account_number: 'BOB-IEC-1', bill_type: 'iec' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.signal).toBe('account_number')
    expect(result.propertyId).toBe('prop-bobbi')
    expect(result.matchedAccountId).toBe('ua-4')
  })

  it('address with trailing punctuation normalizes consistently with verifyBillRouting', () => {
    // Same fixture as verifyBillRouting's "KING GEORGE  14." test, but
    // with no label — must still resolve to Bobbi via address_match
    // because the shared addressFuzzyMatches helper strips the trailing
    // period. Inline duplicates used a different normalizer that would
    // miss this.
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: { address: 'KING GEORGE  14.' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.signal).toBe('address_match')
    expect(result.propertyId).toBe('prop-bobbi')
  })

  it('no signals → label_only with propertyId=null', () => {
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: {},
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('label_only')
    expect(result.signal).toBe('label_only')
    expect(result.propertyId).toBeNull()
  })

  it('account_number without bill_type → label_only (cannot verify utility_type)', () => {
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: { account_number: 'AAA111' },
      utilityAccounts,
      properties,
    })
    expect(result.confidence).toBe('label_only')
    expect(result.propertyId).toBeNull()
  })
})

// Hebrew alias coverage. Real-world failure mode: utility / vaad-bayit
// PDFs are in Hebrew but property.address is stored as English
// transliteration, so plain fuzzy match always fails. The aliases
// dictionary is what bridges the scripts.
const hebrewProperties = [
  {
    id: 'prop-mesila',
    address: 'Mesila, Floor 1, Apartment 4',
    name: 'Mesila',
    hebrewAliases: ['מסילה', 'דרך הרכבת', 'הרכבת ', 'בניין המסילה'],
  },
  {
    id: 'prop-agripas-6',
    address: 'Agripas 6, Apt 7',
    name: 'Agripas 6',
    hebrewAliases: ['אגריפס 6', 'אגריפס 6/7'],
  },
  {
    id: 'prop-agripas-8',
    address: 'Agripas 8, Apt 40',
    name: 'Agripas 8',
    hebrewAliases: ['אגריפס 8 ד 40', 'אגריפס 8/40'],
  },
  {
    id: 'prop-keren-26',
    address: 'Keren Hayesod 5, Apt 26',
    name: 'Keren Hayesod 5, Apt 26',
    hebrewAliases: [
      'קרן היסוד 5/26',
      'קרן היסוד 5 ד 26',
      'קרן היסוד 5 דירה 26',
      'קרן היסוד 26',
    ],
  },
]

describe('verifyBillRouting — Hebrew aliases', () => {
  it('label property has matching Hebrew alias → verified', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-mesila',
      parsedPdf: { address: 'בניין המסילה, ירושלים' },
      utilityAccounts: [],
      properties: hebrewProperties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.signal).toBe('address_match')
    expect(result.propertyId).toBe('prop-mesila')
  })

  it('different property\'s Hebrew alias matches → mismatch (label is wrong)', () => {
    const result = verifyBillRouting({
      labelPropertyId: 'prop-mesila',
      parsedPdf: { address: 'אגריפס 8 ד 40, ירושלים' },
      utilityAccounts: [],
      properties: hebrewProperties,
    })
    expect(result.confidence).toBe('mismatch')
    expect(result.propertyId).toBeNull()
  })
})

describe('resolveBillRoutingWithoutLabel — Hebrew aliases', () => {
  it('Hebrew alias resolves vaad bill from same-management-company sender', () => {
    // Vaad-bayit case: management company sends multiple properties from
    // one email; no sender mapping; no account number. Address alias is
    // the only thing that disambiguates.
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: { address: 'אגריפס 6/7, ירושלים' },
      utilityAccounts: [],
      properties: hebrewProperties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.signal).toBe('address_match')
    expect(result.propertyId).toBe('prop-agripas-6')
  })

  it('Mesila vaad bill routes correctly via Hebrew alias', () => {
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: { address: 'הרכבת 20, המסילה, המושבה הגרמנית, ירושלים' },
      utilityAccounts: [],
      properties: hebrewProperties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.propertyId).toBe('prop-mesila')
  })

  it('Hebrew alias does not falsely match unrelated address', () => {
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: { address: 'רחוב אחר 10, תל אביב' },
      utilityAccounts: [],
      properties: hebrewProperties,
    })
    expect(result.confidence).toBe('label_only')
    expect(result.propertyId).toBeNull()
  })

  it('Bezeq full-word "דירה 26" form routes to Keren Hayesod Apt 26', () => {
    // Real-world string from Bezeq invoice 244610217 (Ariel Marcus,
    // Apr 2026). Earlier alias dictionary only had the abbreviated
    // "ד 26" form, so this would silently fall through to label_only.
    const result = resolveBillRoutingWithoutLabel({
      parsedPdf: { address: 'קרן היסוד 5 דירה 26 ירושלים' },
      utilityAccounts: [],
      properties: hebrewProperties,
    })
    expect(result.confidence).toBe('verified')
    expect(result.propertyId).toBe('prop-keren-26')
  })
})
