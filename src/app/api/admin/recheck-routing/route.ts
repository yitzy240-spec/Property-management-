import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

/**
 * Hebrew address aliases per property. Hardcoded because property.address is
 * stored in English transliteration but utility-bill PDFs are in Hebrew.
 * Substring match (case-insensitive) — must be specific enough to avoid
 * collisions across properties.
 */
const HEBREW_ALIASES: Record<string, string[]> = {
  // Agripas 6, Apt 7
  '22222222-aaaa-0000-0000-000000000002': ['אגריפס 6', 'אגריפס 7', 'אג"פ 6', 'אג"פ 7'],
  // Agripas 8, Apt 40
  '22222222-aaaa-0000-0000-000000000003': ['אגריפס 8'],
  // Jerusalem Skyline (Jaffa 105, JTower)
  'dace8043-80ad-4e9d-a530-7e3c3ba0efec': ['יפו 105', 'ג\'אפא 105', 'ג\'יי טאואר', 'jtower'],
  // Keren Hayesod 5, Apt 26
  'b26a5f8a-cb28-4174-9a87-62938eea066b': ['קרן היסוד 5/26', 'קרן היסוד 5 ד 26', 'קרן היסוד 26'],
  // Keren Hayesod 5, Apt 3
  '22222222-aaaa-0000-0000-000000000005': ['קרן היסוד 5/3', 'קרן היסוד 5 ד 3', 'קרן היסוד 3'],
  // Mesila (HaRakevet 20/3)
  'cb5a733b-24b6-4e3a-bf1d-972dcec63e3a': ['מסילה', 'דרך הרכבת', 'הרכבת ', 'בניין המסילה'],
  // Savyon View (Raul Wallenberg 3, Apt 33)
  '22222222-aaaa-0000-0000-000000000004': ['ראול ולנברג', 'סביון'],
}

/**
 * POST /api/admin/recheck-routing  (admin OR cron-secret)
 *
 * Walks every legacy bill (routing_confidence IS NULL) and proposes a
 * better property assignment by scoring all properties against the
 * parsed PDF data:
 *
 *   +10 if PDF account_number + bill_type matches a utility account
 *   +5  if PDF address fuzzy-matches the property address
 *   +3  if PDF holder name token-matches the owner name
 *
 * Default = dry run (returns proposals, makes no changes).
 * Pass ?apply=true to commit. Applied bills are demoted to status='flagged'
 * so the admin reviews each reassignment via the edit drawer.
 */
export async function GET(request: Request) {
  try {
    // Allow either admin session OR cron-secret bearer token (for curl-based ops)
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      await requireAdmin()
    }

    const url = new URL(request.url)
    const apply = url.searchParams.get('apply') === 'true'

    const supabase = createServiceClient()

    const [billsRes, propsRes, ownersRes, accountsRes] = await Promise.all([
      supabase
        .from('bills')
        .select('id, property_id, status, bill_type, ai_parsed_data')
        .is('routing_confidence', null),
      supabase.from('properties').select('id, name, address, owner_id'),
      supabase.from('owners').select('id, full_name'),
      supabase
        .from('property_utility_accounts')
        .select('id, property_id, utility_type, account_number'),
    ])

    const bills = billsRes.data ?? []
    const properties = propsRes.data ?? []
    const owners = ownersRes.data ?? []
    const accounts = accountsRes.data ?? []

    const proposals: Array<{
      billId: string
      from: string | null
      fromName: string
      to: string
      toName: string
      score: number
      currentScore: number
      reasons: string[]
      pdfHolder: string | null
      pdfAddress: string | null
      pdfAccountNumber: string | null
      billType: string | null
      currentStatus: string
    }> = []

    for (const bill of bills) {
      const pdf = (bill.ai_parsed_data ?? {}) as {
        account_number?: string
        account_holder?: string
        address?: string
      }
      const billType = (bill.bill_type as string | null) ?? null

      const scores = properties.map(p => {
        const owner = owners.find(o => o.id === p.owner_id)
        let score = 0
        const reasons: string[] = []

        // Account number + utility type match (strongest signal)
        if (pdf.account_number && billType) {
          const acctMatch = accounts.find(
            a =>
              a.property_id === p.id &&
              a.utility_type === billType &&
              a.account_number === pdf.account_number,
          )
          if (acctMatch) {
            score += 10
            reasons.push('account#')
          }
        }

        // Address fuzzy match (English vs English)
        if (pdf.address && p.address) {
          const a = normalizeAddr(pdf.address)
          const b = normalizeAddr(p.address)
          if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
            score += 5
            reasons.push('address')
          }
        }

        // Hebrew alias match (PDF address vs known Hebrew aliases for this property)
        if (pdf.address) {
          const aliases = HEBREW_ALIASES[p.id] ?? []
          const pdfLower = pdf.address.toLowerCase()
          const hit = aliases.find(alias => pdfLower.includes(alias.toLowerCase()))
          if (hit) {
            score += 6
            reasons.push(`he:${hit}`)
          }
        }

        // Holder name token match — works for Hebrew + English
        if (pdf.account_holder && owner?.full_name) {
          if (nameTokensOverlap(pdf.account_holder, owner.full_name)) {
            score += 3
            reasons.push('holder')
          }
        }

        return { propertyId: p.id, propertyName: p.name, score, reasons }
      })

      scores.sort((a, b) => b.score - a.score)
      const best = scores[0]
      const current = scores.find(s => s.propertyId === bill.property_id)
      const currentScore = current?.score ?? 0
      const currentName = current?.propertyName ?? '(unknown)'

      // Only propose if best clearly beats current and is meaningful
      const shouldReroute =
        best.score >= 5 && best.score > currentScore + 1 && best.propertyId !== bill.property_id

      if (shouldReroute) {
        proposals.push({
          billId: bill.id,
          from: bill.property_id,
          fromName: currentName,
          to: best.propertyId,
          toName: best.propertyName,
          score: best.score,
          currentScore,
          reasons: best.reasons,
          pdfHolder: pdf.account_holder ?? null,
          pdfAddress: pdf.address ?? null,
          pdfAccountNumber: pdf.account_number ?? null,
          billType,
          currentStatus: bill.status as string,
        })
      }
    }

    if (apply) {
      let applied = 0
      const errors: Array<{ billId: string; message: string }> = []
      for (const p of proposals) {
        const { error } = await supabase
          .from('bills')
          .update({
            property_id: p.to,
            routing_confidence: 'verified',
            status: 'flagged',
            approved_at: null,
            approved_by: null,
            is_anomaly: true,
            anomaly_note: `Auto-reassigned by recheck-routing (${p.reasons.join(', ')}, score ${p.score}). Original property: ${p.fromName}.`,
          })
          .eq('id', p.billId)
        if (error) errors.push({ billId: p.billId, message: error.message })
        else applied++
      }
      return NextResponse.json({
        applied,
        proposed: proposals.length,
        errors,
        scanned: bills.length,
      })
    }

    return NextResponse.json({
      dryRun: true,
      legacyBillsScanned: bills.length,
      proposedReroutes: proposals.length,
      proposals,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const e = err as Error
    console.error('[recheck-routing] fatal', e?.message, e?.stack)
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 })
  }
}

function normalizeAddr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokensOverlap(a: string, b: string): boolean {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.,'"()]/g, '')
      .split(/\s+/)
      .filter(t => t.length >= 3)
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return false
  return ta.some(x => tb.some(y => y.includes(x) || x.includes(y)))
}
