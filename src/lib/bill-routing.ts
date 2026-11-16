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
  /** Optional Hebrew/alternate-script aliases that should match against the
   * PDF's parsed address. Required because property.address is stored in
   * English transliteration but PDFs from utility companies are in Hebrew. */
  hebrewAliases?: string[]
}

/**
 * Hebrew address aliases keyed by property id. Substring match
 * (case-insensitive) — must be specific enough to avoid collisions
 * across properties. Kept here (next to the routing logic) so both
 * the live parse pipeline and the recheck-routing endpoint share
 * the same dictionary.
 */
export const HEBREW_ALIASES: Record<string, string[]> = {
  // Agripas 6, Apt 7 — utility companies sometimes mislabel this as
  // "Agripas 8 apt 7" (per Ariel: "the IEC is annoying. Water company
  // as well"). Discriminator vs Agripas 8 is the APT number (7 vs 40).
  // NOTE: "אגריפס 6" alone is intentionally NOT included to avoid
  // false matches on "אגריפס 6-8" (the building complex name).
  '22222222-aaaa-0000-0000-000000000002': [
    'אגריפס 6/7',
    'אגריפס 6 דירה 7',
    'אגריפס 6 ד 7',
    'אגריפס 7/6',
    'אגריפס 8 ד 7',
    'אגריפס 8 דירה 7',
    'אגריפס 8/7',
    'אגריפס 6-8 דירה 7',
    'אג"פ 6',
    'אג"פ 6/7',
  ],
  // Agripas 8, Apt 40 — MUST include apt-40 in the alias so the bare
  // "אגריפס 8" doesn't grab the apt-7 mislabels (those are Agripas 6).
  '22222222-aaaa-0000-0000-000000000003': [
    'אגריפס 8 ד 40',
    'אגריפס 8 דירה 40',
    'אגריפס 8/40',
    'אגריפס 8ב ד 40',
    'אגריפס 8 ב 40',
    'אגריפס 8ב',
    'אגריפס 6-8 דירה 40',
    'אגריפס 6-8 ד 40',
  ],
  // Jerusalem Skyline (Jaffa 105, JTower)
  'dace8043-80ad-4e9d-a530-7e3c3ba0efec': ['יפו 105', 'ג\'אפא 105', 'ג\'יי טאואר', 'jtower'],
  // Keren Hayesod 5, Apt 26 — Bezeq prints "קרן היסוד 5 דירה 26" (full
  // word דירה), Hagihon uses "ד" abbreviation, others use "5/26" slash
  // form. Cover all three.
  'b26a5f8a-cb28-4174-9a87-62938eea066b': [
    'קרן היסוד 5/26',
    'קרן היסוד 5 ד 26',
    'קרן היסוד 5 דירה 26',
    'קרן היסוד 26',
  ],
  // Keren Hayesod 5, Apt 3
  '22222222-aaaa-0000-0000-000000000005': [
    'קרן היסוד 5/3',
    'קרן היסוד 5 ד 3',
    'קרן היסוד 5 דירה 3',
    'קרן היסוד 3',
  ],
  // Mesila (HaRakevet 20/3) — vaad bills come addressed to "המסילה" /
  // "דרך הרכבת". Per Ariel, the same management company sends Mesila +
  // Agripas vaad bills, so the alias is what disambiguates them.
  'cb5a733b-24b6-4e3a-bf1d-972dcec63e3a': ['מסילה', 'דרך הרכבת', 'הרכבת ', 'בניין המסילה'],
  // Savyon View (Raul Wallenberg 3, Apt 33)
  '22222222-aaaa-0000-0000-000000000004': ['ראול ולנברג', 'סביון'],
}

/** True when the parsed PDF address contains any of the property's
 * Hebrew aliases. Case-insensitive substring match.
 * Returns the matched alias, or null if none match. */
function matchesHebrewAlias(pdfAddress: string, aliases: string[] | undefined): string | null {
  if (!aliases || aliases.length === 0) return null
  const lower = pdfAddress.toLowerCase()
  return aliases.find(a => lower.includes(a.toLowerCase())) ?? null
}

/** Find the best Hebrew alias match across all properties, preferring
 * more specific matches (with apartment numbers) over generic ones.
 * Returns { property, matchedAlias } or null. */
function findBestHebrewAliasMatch(
  pdfAddress: string,
  properties: PropertyRow[],
): { property: PropertyRow; matchedAlias: string } | null {
  const matches: Array<{ property: PropertyRow; matchedAlias: string; specificity: number }> = []

  for (const prop of properties) {
    const match = matchesHebrewAlias(pdfAddress, prop.hebrewAliases)
    if (match) {
      // Calculate specificity: prefer aliases with apartment/דירה numbers
      let specificity = match.length
      if (/\d{2,}/.test(match)) specificity += 100  // Has 2+ digit number (apartment)
      if (/ד(?:ירה)?\s*\d/.test(match)) specificity += 50  // Has "ד" or "דירה" + number
      matches.push({ property: prop, matchedAlias: match, specificity })
    }
  }

  if (matches.length === 0) return null

  // Return the most specific match
  matches.sort((a, b) => b.specificity - a.specificity)
  return { property: matches[0].property, matchedAlias: matches[0].matchedAlias }
}

/** Attach the embedded Hebrew alias dictionary to a list of property rows.
 * Lets callers pass plain DB rows into the routing helpers without each
 * caller having to merge the alias map themselves. */
export function withHebrewAliases<T extends { id: string }>(rows: T[]): (T & { hebrewAliases?: string[] })[] {
  return rows.map(r => ({ ...r, hebrewAliases: HEBREW_ALIASES[r.id] }))
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

  // 2b) Hebrew alias match. PDFs are in Hebrew but property.address is
  // English transliteration, so the English fuzzy match above usually
  // fails. The alias dictionary gives us a Hebrew bridge.
  // Use best-match logic to prefer specific aliases (with apt numbers).
  if (parsedPdf.address) {
    const bestMatch = findBestHebrewAliasMatch(parsedPdf.address, properties)
    if (bestMatch) {
      if (bestMatch.property.id === labelPropertyId) {
        return {
          propertyId: labelPropertyId,
          confidence: 'verified',
          signal: 'address_match',
          reason: `PDF address "${parsedPdf.address}" matches Hebrew alias "${bestMatch.matchedAlias}" for label property.`,
        }
      } else {
        // Different property matched — that's a mismatch
        return {
          propertyId: null,
          confidence: 'mismatch',
          signal: 'address_match',
          reason: `PDF address "${parsedPdf.address}" matches Hebrew alias "${bestMatch.matchedAlias}" for property "${bestMatch.property.name}", not the Gmail label. Manual routing required.`,
        }
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

export interface ResolveBillRoutingWithoutLabelArgs {
  parsedPdf: ParsedPdf
  utilityAccounts: UtilityAccountRow[]
  properties: PropertyRow[]
}

/**
 * Routing fallback when there's no pre-match candidate from a Gmail
 * label, sender mapping, or owner-name match. Tries (1) account number
 * + utility type, then (2) fuzzy address match against any property.
 *
 * Returns `propertyId=null` with `label_only` confidence when neither
 * signal is available, so the caller can flag the bill for manual
 * routing.
 *
 * Uses the same `normalizeAddress` / `addressFuzzyMatches` helpers as
 * `verifyBillRouting`, so address comparisons (e.g. trailing periods,
 * collapsed whitespace) behave identically across both code paths.
 */
export function resolveBillRoutingWithoutLabel(
  args: ResolveBillRoutingWithoutLabelArgs,
): RoutingResult {
  const { parsedPdf, utilityAccounts, properties } = args

  if (parsedPdf.account_number && parsedPdf.bill_type) {
    const acct = utilityAccounts.find(
      ua =>
        ua.account_number === parsedPdf.account_number &&
        ua.utility_type === parsedPdf.bill_type,
    )
    if (acct) {
      return {
        propertyId: acct.property_id,
        confidence: 'verified',
        signal: 'account_number',
        matchedAccountId: acct.id,
        reason: `Account number ${parsedPdf.account_number} (${parsedPdf.bill_type}) → property ${acct.property_id}.`,
      }
    }
  }

  if (parsedPdf.address) {
    const match = properties.find(p =>
      addressFuzzyMatches(parsedPdf.address as string, p.address),
    )
    if (match) {
      return {
        propertyId: match.id,
        confidence: 'verified',
        signal: 'address_match',
        reason: `PDF address matches property "${match.address}".`,
      }
    }
    // Hebrew alias fallback — use best-match logic to prefer specific
    // aliases with apartment numbers over generic building names
    const bestMatch = findBestHebrewAliasMatch(parsedPdf.address, properties)
    if (bestMatch) {
      return {
        propertyId: bestMatch.property.id,
        confidence: 'verified',
        signal: 'address_match',
        reason: `PDF address matches Hebrew alias "${bestMatch.matchedAlias}" for property "${bestMatch.property.name}".`,
      }
    }
  }

  return {
    propertyId: null,
    confidence: 'label_only',
    signal: 'label_only',
    reason: 'No routing signal — admin needs to assign manually.',
  }
}
