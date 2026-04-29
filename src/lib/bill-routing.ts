/**
 * Bill routing verification.
 *
 * Resolves which property a bill belongs to using multiple signals:
 * the Gmail label (where the user filed it), the parsed PDF account
 * number + utility type combination, the parsed property address, and
 * the parsed account holder name.
 *
 * Goals:
 * 1. Never silently override the Gmail label without a stronger signal.
 * 2. Detect mismatches (label says property A, but account number is
 *    registered to property B with the same utility type) and bubble
 *    them up so admin can review instead of silently misrouting.
 * 3. Surface routing confidence so downstream auto-learning (e.g.
 *    `bill_sender_mappings`) is only triggered on verified bills.
 */

export type RoutingSignal =
  | 'account_number'
  | 'address_match'
  | 'holder_match'
  | 'label_only'

export type RoutingConfidence = 'verified' | 'label_only' | 'mismatch'

export interface RoutingResult {
  /** Resolved property id; `null` when we couldn't decide and need manual review. */
  propertyId: string | null
  confidence: RoutingConfidence
  signal: RoutingSignal
  matchedAccountId?: string
  /** Human-readable explanation for the audit trail. */
  reason?: string
}

interface ParsedPdf {
  account_number?: string
  account_holder?: string
  address?: string
  bill_type?: string
}

interface UtilityAccountRow {
  id: string
  property_id: string
  utility_type: string
  account_number: string
}

interface PropertyRow {
  id: string
  address: string
  name: string
}

export interface VerifyBillRoutingArgs {
  labelPropertyId: string
  parsedPdf: ParsedPdf
  utilityAccounts: UtilityAccountRow[]
  properties: PropertyRow[]
}

/**
 * Normalize an address-ish string so substring comparisons are tolerant
 * of punctuation, spacing, and casing variations.
 *
 * Hebrew & Latin: keep letters/digits, collapse whitespace, lowercase.
 */
function normalizeAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Loose address match: bidirectional substring after normalization.
 * Either side must have at least 3 characters of overlap to count
 * (avoids "1" matching "1 Main St").
 */
function addressFuzzyMatches(a: string, b: string): boolean {
  const na = normalizeAddress(a)
  const nb = normalizeAddress(b)
  if (na.length < 3 || nb.length < 3) return false
  return na.includes(nb) || nb.includes(na)
}

/**
 * Resolve the property a bill should be assigned to and report how
 * confident we are. See module docstring for invariants.
 */
export function verifyBillRouting(args: VerifyBillRoutingArgs): RoutingResult {
  const { labelPropertyId, parsedPdf, utilityAccounts, properties } = args
  const labelProperty = properties.find(p => p.id === labelPropertyId)

  // 1) Account number + utility type — strongest signal.
  // Only trust the override when *both* the account number AND the
  // utility type match. A bare account-number collision across utility
  // types (e.g. a Bezeq contract # that happens to match a gas
  // contract #) must NOT override the label.
  if (parsedPdf.account_number && parsedPdf.bill_type) {
    const acctMatch = utilityAccounts.find(
      ua =>
        ua.account_number === parsedPdf.account_number &&
        ua.utility_type === parsedPdf.bill_type,
    )
    if (acctMatch) {
      if (acctMatch.property_id === labelPropertyId) {
        return {
          propertyId: labelPropertyId,
          confidence: 'verified',
          signal: 'account_number',
          matchedAccountId: acctMatch.id,
          reason: `Account number ${parsedPdf.account_number} (${parsedPdf.bill_type}) matches the label property.`,
        }
      }
      return {
        propertyId: null,
        confidence: 'mismatch',
        signal: 'account_number',
        matchedAccountId: acctMatch.id,
        reason: `Account number ${parsedPdf.account_number} (${parsedPdf.bill_type}) is registered to a different property than the Gmail label. Manual routing required.`,
      }
    }
  }

  // 2) Address fuzzy match against the label property's address.
  if (parsedPdf.address && labelProperty) {
    if (addressFuzzyMatches(parsedPdf.address, labelProperty.address)) {
      return {
        propertyId: labelPropertyId,
        confidence: 'verified',
        signal: 'address_match',
        reason: `PDF address "${parsedPdf.address}" matches label property address "${labelProperty.address}".`,
      }
    }
  }

  // 3) Account holder match — currently informational; if we ever wire
  // owner names in here we can promote this to a verified signal.

  // 4) Fallback: trust the Gmail label but record low confidence.
  return {
    propertyId: labelPropertyId,
    confidence: 'label_only',
    signal: 'label_only',
    reason: 'No account number or address verification available — trusting Gmail label only.',
  }
}
