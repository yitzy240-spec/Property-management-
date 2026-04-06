/**
 * Israel Electric Corporation (IEC) API Client
 * Based on py-iec-api by GuyKh (https://github.com/GuyKh/py-iec-api)
 *
 * Auth flow:
 * 1. login_with_id(israeliId) → sends OTP to registered phone
 * 2. verify_otp(code) → returns JWT token
 * 3. Use token for all subsequent requests (refresh when expired)
 *
 * For ApartmentOS: Marcus does OTP once per contract, we store the token.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'

const IEC_BASE = 'https://iecapi.iec.co.il/api'

const HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'origin': 'https://www.iec.co.il',
  'referer': 'https://www.iec.co.il/',
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
}

// ── Types ──

export interface IecInvoice {
  invoiceNumber: string
  invoiceDate: string
  totalAmount: number
  isPaid: boolean
  fromDate: string
  toDate: string
  contractId: string
  bpNumber: string
}

interface IecTokens {
  idToken: string
  refreshToken: string
  expiresAt: number
  bpNumber: string
  contractIds: string[]
}

// ── Token Management ──

async function getStoredTokens(): Promise<IecTokens | null> {
  const serviceClient = createServiceClient()
  const { data } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'iec_tokens')
    .single()

  if (!data?.value) return null

  try {
    return JSON.parse(await decrypt(data.value))
  } catch {
    return null
  }
}

async function storeTokens(tokens: IecTokens): Promise<void> {
  const serviceClient = createServiceClient()
  await serviceClient
    .from('app_settings')
    .upsert({
      key: 'iec_tokens',
      value: await encrypt(JSON.stringify(tokens)),
      description: 'IEC API tokens (encrypted)',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
}

async function authenticatedFetch(url: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...HEADERS,
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })
}

// ── Auth Flow ──

/**
 * Step 1: Initiate login with Israeli ID number.
 * IEC sends OTP to the phone number registered with the account.
 */
export async function initLogin(israeliId: string): Promise<{ factorId: string }> {
  const res = await fetch(`${IEC_BASE}/Authentication/${israeliId}/1/-1?customErrorPage=true`, {
    method: 'GET',
    headers: HEADERS,
  })

  if (!res.ok) {
    throw new Error(`IEC login initiation failed: ${res.status}`)
  }

  const data = await res.json()
  return { factorId: data.factorId || data.FactorId || israeliId }
}

/**
 * Step 2: Verify OTP code sent to phone.
 * Returns JWT tokens for API access.
 */
export async function verifyOtp(israeliId: string, otpCode: string): Promise<IecTokens> {
  // The actual OTP verification endpoint varies — this follows the py-iec-api pattern
  const res = await fetch(`${IEC_BASE}/Authentication/VerifyOtp`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      id: israeliId,
      otpCode,
    }),
  })

  if (!res.ok) {
    throw new Error(`IEC OTP verification failed: ${res.status}`)
  }

  const data = await res.json()
  const tokens: IecTokens = {
    idToken: data.id_token || data.idToken || data.token,
    refreshToken: data.refresh_token || data.refreshToken || '',
    expiresAt: Date.now() + 3600 * 1000, // 1 hour
    bpNumber: '',
    contractIds: [],
  }

  // Get customer info to populate bpNumber and contracts
  try {
    const customerRes = await authenticatedFetch(`${IEC_BASE}/customer`, tokens.idToken)
    if (customerRes.ok) {
      const customer = await customerRes.json()
      tokens.bpNumber = customer.bp_number || customer.bpNumber || ''
    }

    if (tokens.bpNumber) {
      const contractsRes = await authenticatedFetch(
        `${IEC_BASE}/customer/contract/${tokens.bpNumber}`,
        tokens.idToken
      )
      if (contractsRes.ok) {
        const contracts = await contractsRes.json()
        tokens.contractIds = (contracts || []).map((c: { contract_id?: string; contractId?: string }) =>
          c.contract_id || c.contractId || ''
        ).filter(Boolean)
      }
    }
  } catch {
    // Customer fetch failed — tokens still valid
  }

  await storeTokens(tokens)
  return tokens
}

// ── Bill Fetching ──

/**
 * Get all billing invoices for a contract.
 */
export async function getBillingInvoices(
  contractId?: string,
  bpNumber?: string,
  onlyOpen?: boolean
): Promise<IecInvoice[]> {
  const tokens = await getStoredTokens()
  if (!tokens) throw new Error('IEC not connected. Complete OTP auth first.')

  const bp = bpNumber || tokens.bpNumber
  const contract = contractId || tokens.contractIds[0]

  if (!bp || !contract) throw new Error('No IEC contract configured')

  let url = `${IEC_BASE}/BillingCollection/invoices/${contract}/${bp}`
  if (onlyOpen !== undefined) {
    url += `?onlyOpen=${onlyOpen}`
  }

  const res = await authenticatedFetch(url, tokens.idToken)

  if (res.status === 401) {
    // Token expired — would need re-auth
    throw new Error('IEC token expired. Re-authenticate required.')
  }

  if (!res.ok) {
    throw new Error(`IEC billing fetch failed: ${res.status}`)
  }

  const data = await res.json()
  return (data.invoices || data || []).map((inv: Record<string, unknown>) => ({
    invoiceNumber: String(inv.invoiceNumber || inv.invoice_number || ''),
    invoiceDate: String(inv.invoiceDate || inv.invoice_date || ''),
    totalAmount: Number(inv.totalAmount || inv.total_amount || 0),
    isPaid: Boolean(inv.isPaid || inv.is_paid),
    fromDate: String(inv.fromDate || inv.from_date || ''),
    toDate: String(inv.toDate || inv.to_date || ''),
    contractId: contract,
    bpNumber: bp,
  }))
}

/**
 * Download an invoice PDF.
 */
export async function getInvoicePdf(
  invoiceNumber: string,
  contractId?: string,
  bpNumber?: string
): Promise<Buffer> {
  const tokens = await getStoredTokens()
  if (!tokens) throw new Error('IEC not connected.')

  const bp = bpNumber || tokens.bpNumber
  const contract = contractId || tokens.contractIds[0]

  const res = await fetch(`${IEC_BASE}/BillingCollection/pdf`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Authorization': `Bearer ${tokens.idToken}`,
      'accept': 'application/pdf',
    },
    body: JSON.stringify({
      invoice_number: invoiceNumber,
      contract_id: contract,
      bp_number: bp,
    }),
  })

  if (!res.ok) {
    throw new Error(`IEC PDF download failed: ${res.status}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Sync IEC invoices into the bills table.
 * Deduplicates by invoice_number to prevent double-recording
 * (from both IEC API and Gmail email parsing).
 */
export async function syncIecBills(): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const result = { synced: 0, skipped: 0, errors: [] as string[] }

  const tokens = await getStoredTokens()
  if (!tokens) {
    result.errors.push('IEC not connected')
    return result
  }

  const serviceClient = createServiceClient()

  // Get properties with IEC contract mapping
  // For now, we match by the IEC contract address to our properties
  const { data: properties } = await serviceClient
    .from('properties')
    .select('id, name, address')
    .eq('is_active', true)

  for (const contractId of tokens.contractIds) {
    try {
      const invoices = await getBillingInvoices(contractId, tokens.bpNumber)

      for (const inv of invoices) {
        // Dedup: check if this invoice number already exists
        const { data: existing } = await serviceClient
          .from('bills')
          .select('id')
          .or(`ai_parsed_data->>account_number.eq.${inv.invoiceNumber},ai_parsed_data->>invoice_number.eq.${inv.invoiceNumber}`)
          .limit(1)

        if (existing && existing.length > 0) {
          result.skipped++
          continue
        }

        // Also check by gmail_message_id pattern for IEC emails
        const { data: emailExisting } = await serviceClient
          .from('bills')
          .select('id')
          .eq('bill_type', 'iec')
          .gte('created_at', inv.fromDate)
          .lte('created_at', inv.toDate || new Date().toISOString())
          .limit(1)

        if (emailExisting && emailExisting.length > 0) {
          result.skipped++
          continue
        }

        // Download PDF
        let storagePath: string | null = null
        try {
          const pdf = await getInvoicePdf(inv.invoiceNumber, contractId, tokens.bpNumber)
          storagePath = `bills/iec_${inv.invoiceNumber}.pdf`
          await serviceClient.storage
            .from('documents')
            .upload(storagePath, pdf, { contentType: 'application/pdf' })
        } catch {
          // PDF download failed — create bill without PDF
        }

        // Create bill
        const amountAgorot = Math.round(inv.totalAmount * 100)

        await serviceClient.from('bills').insert({
          property_id: null, // Needs manual assignment or address matching
          bill_type: 'iec',
          amount_agorot: amountAgorot,
          due_date: inv.invoiceDate || null,
          billing_period_start: inv.fromDate || null,
          billing_period_end: inv.toDate || null,
          status: inv.isPaid ? 'approved' : 'pending_review',
          pdf_storage_path: storagePath,
          ai_parsed_data: {
            source: 'iec_api',
            invoice_number: inv.invoiceNumber,
            contract_id: contractId,
            bp_number: tokens.bpNumber,
            account_number: inv.invoiceNumber,
          },
        })

        result.synced++
      }
    } catch (err) {
      result.errors.push(`Contract ${contractId}: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  return result
}
