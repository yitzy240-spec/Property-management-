/**
 * Israel Electric Corporation (IEC) API Client
 * Based on py-iec-api by GuyKh (https://github.com/GuyKh/py-iec-api)
 *
 * Auth flow:
 * 1. login_with_id(israeliId) → sends OTP to registered phone
 * 2. verify_otp(code) → returns JWT token
 * 3. Use token for all subsequent requests (refresh when expired)
 *
 * Per-property: Each property has its own IEC auth (different TZ per property).
 */

import { createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/encryption'

const IEC_BASE = 'https://iecapi.iec.co.il/api'

const HEADERS: Record<string, string> = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en,he;q=0.9',
  'content-type': 'application/json',
  'dnt': '1',
  'origin': 'https://www.iec.co.il',
  'referer': 'https://www.iec.co.il/',
  'sec-ch-ua': '"Chromium";v="121", "Not A(Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'x-iec-idt': '1',
  'x-iec-webview': '1',
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

// ── Token Management (per-property) ──

function tokenKey(propertyId: string): string {
  return `iec_tokens_${propertyId}`
}

async function getStoredTokens(propertyId: string): Promise<IecTokens | null> {
  const serviceClient = createServiceClient()
  const { data } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', tokenKey(propertyId))
    .single()

  if (!data?.value) return null

  try {
    return JSON.parse(await decrypt(data.value))
  } catch {
    return null
  }
}

async function storeTokens(propertyId: string, tokens: IecTokens): Promise<void> {
  const serviceClient = createServiceClient()
  await serviceClient
    .from('app_settings')
    .upsert({
      key: tokenKey(propertyId),
      value: await encrypt(JSON.stringify(tokens)),
      description: `IEC tokens for property ${propertyId}`,
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

// ── Auth Flow (Okta PKCE) ──

const IEC_OKTA_BASE = 'https://iec-ext.okta.com'
const IEC_CLIENT_ID = '0oaqf6zr7yEcQZqqt2p7'
const IEC_REDIRECT_URI = 'com.iecrn:/'

/** Generate PKCE code_verifier and code_challenge */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const codeVerifier = Buffer.from(array).toString('base64url')

  const hash = crypto.subtle
    ? null // will use sync below
    : null
  // Use Node crypto for SHA-256
  const { createHash } = require('crypto') as typeof import('crypto')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

  return { codeVerifier, codeChallenge }
}

/**
 * Exchange Okta session token for IEC API id_token via PKCE OIDC flow.
 * 1. GET /authorize with sessionToken → HTML with auth code
 * 2. POST /token with code + code_verifier → id_token
 */
async function exchangeSessionForToken(sessionToken: string): Promise<{ idToken: string; refreshToken: string }> {
  const { codeVerifier, codeChallenge } = generatePKCE()
  const state = Math.random().toString(36).slice(2, 14)

  // Step 1: Authorize — get auth code from HTML response
  const authorizeParams = new URLSearchParams({
    client_id: IEC_CLIENT_ID,
    response_type: 'id_token code',
    response_mode: 'form_post',
    scope: 'openid email profile offline_access',
    redirect_uri: IEC_REDIRECT_URI,
    state,
    nonce: 'abc123',
    code_challenge_method: 'S256',
    sessionToken,
    code_challenge: codeChallenge,
  })

  const authorizeRes = await fetch(
    `${IEC_OKTA_BASE}/oauth2/default/v1/authorize?${authorizeParams}`,
    { method: 'GET', redirect: 'manual' }
  )

  let authCode = ''
  // Check for redirect with code in URL/body
  if (authorizeRes.status === 200) {
    const html = await authorizeRes.text()
    const codeMatch = html.match(/name="code"\s+value="([^"]+)"/)
    if (codeMatch) authCode = codeMatch[1]
  } else if (authorizeRes.status === 302 || authorizeRes.status === 303) {
    const location = authorizeRes.headers.get('location') || ''
    const codeMatch = location.match(/[?&]code=([^&]+)/)
    if (codeMatch) authCode = codeMatch[1]
  }

  if (!authCode) {
    throw new Error('Failed to get authorization code from IEC/Okta')
  }

  // Step 2: Exchange code for tokens
  const tokenRes = await fetch(`${IEC_OKTA_BASE}/oauth2/default/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      client_id: IEC_CLIENT_ID,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: IEC_REDIRECT_URI,
      code: authCode,
    }).toString(),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '')
    throw new Error(`Token exchange failed: ${tokenRes.status} ${errText.slice(0, 200)}`)
  }

  const tokenData = await tokenRes.json()

  if (!tokenData.id_token) {
    throw new Error('Token exchange did not return id_token')
  }

  return {
    idToken: tokenData.id_token,
    refreshToken: tokenData.refresh_token || '',
  }
}

/**
 * Step 1: Initiate login — sends ID to Okta, returns available OTP factors.
 * IEC uses Okta with username format: {id}@iec.co.il
 */
export async function initLogin(idNumber: string): Promise<{
  stateToken: string
  factors: { id: string; type: string; email?: string }[]
}> {
  const res = await fetch(`${IEC_OKTA_BASE}/api/v1/authn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username: `${idNumber}@iec.co.il` }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`IEC login failed: ${res.status} ${errText.slice(0, 200)}`)
  }

  const data = await res.json()

  if (data.status !== 'UNAUTHENTICATED' || !data._embedded?.factors?.length) {
    throw new Error('Unexpected IEC auth response — no OTP factors available')
  }

  const factors = (data._embedded.factors as Array<{
    id: string
    factorType: string
    profile?: { email?: string }
    _links?: { verify?: { href?: string } }
  }>).map(f => ({
    id: f.id,
    type: f.factorType,
    email: f.profile?.email,
    verifyUrl: f._links?.verify?.href,
  }))

  // Store stateToken in app_settings temporarily for the verify step
  const serviceClient = createServiceClient()
  await serviceClient.from('app_settings').upsert({
    key: 'iec_okta_state',
    value: JSON.stringify({ stateToken: data.stateToken, factors }),
    description: 'Temporary IEC Okta state token',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  return { stateToken: data.stateToken, factors }
}

/**
 * Step 1b: Send OTP to chosen factor (email).
 */
export async function sendOtp(factorId: string): Promise<void> {
  const serviceClient = createServiceClient()
  const { data: stateData } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'iec_okta_state')
    .single()

  if (!stateData?.value) throw new Error('No active IEC login session')

  const { stateToken, factors } = JSON.parse(stateData.value)
  const factor = factors.find((f: { id: string }) => f.id === factorId)
  const verifyUrl = factor?.verifyUrl || `${IEC_OKTA_BASE}/api/v1/authn/factors/${factorId}/verify`

  const res = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ stateToken }),
  })

  if (!res.ok) {
    throw new Error(`Failed to send OTP: ${res.status}`)
  }
}

/**
 * Step 2: Verify OTP code.
 * Returns JWT tokens for API access. Stores per-property.
 */
export async function verifyOtp(otpCode: string, factorId: string, propertyId: string): Promise<IecTokens> {
  const serviceClient = createServiceClient()
  const { data: stateData } = await serviceClient
    .from('app_settings')
    .select('value')
    .eq('key', 'iec_okta_state')
    .single()

  if (!stateData?.value) throw new Error('No active IEC login session')

  const { stateToken } = JSON.parse(stateData.value)

  // Verify OTP with Okta
  const res = await fetch(`${IEC_OKTA_BASE}/api/v1/authn/factors/${factorId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ stateToken, passCode: otpCode }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OTP verification failed: ${res.status} ${errText.slice(0, 200)}`)
  }

  const data = await res.json()

  if (data.status !== 'SUCCESS' || !data.sessionToken) {
    throw new Error('OTP verification did not return a session token')
  }

  // Exchange Okta session token for IEC API id_token via PKCE flow
  const { idToken, refreshToken } = await exchangeSessionForToken(data.sessionToken)

  const tokens: IecTokens = {
    idToken,
    refreshToken,
    expiresAt: Date.now() + 3600 * 1000,
    bpNumber: '',
    contractIds: [],
  }

  // Get customer info
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

  // Clean up temp state
  await serviceClient.from('app_settings').delete().eq('key', 'iec_okta_state')

  await storeTokens(propertyId, tokens)
  return tokens
}

/**
 * Check if a property has IEC connected.
 */
export async function getIecStatus(propertyId: string): Promise<{ connected: boolean; contracts: string[] }> {
  const tokens = await getStoredTokens(propertyId)
  if (!tokens) return { connected: false, contracts: [] }
  return { connected: true, contracts: tokens.contractIds }
}

// ── Bill Fetching ──

/**
 * Get all billing invoices for a property's IEC account.
 */
export async function getBillingInvoices(
  propertyId: string,
  contractId?: string,
  bpNumber?: string,
): Promise<IecInvoice[]> {
  const tokens = await getStoredTokens(propertyId)
  if (!tokens) throw new Error('IEC not connected for this property. Complete OTP auth first.')

  const bp = bpNumber || tokens.bpNumber
  const contract = contractId || tokens.contractIds[0]

  if (!bp || !contract) throw new Error('No IEC contract found for this property')

  const url = `${IEC_BASE}/BillingCollection/invoices/${contract}/${bp}`

  const res = await authenticatedFetch(url, tokens.idToken)

  if (res.status === 401) {
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
  propertyId: string,
  invoiceNumber: string,
  contractId?: string,
  bpNumber?: string
): Promise<Buffer> {
  const tokens = await getStoredTokens(propertyId)
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
 * Sync IEC invoices for a specific property into the bills table.
 */
export async function syncIecBills(propertyId: string): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const result = { synced: 0, skipped: 0, errors: [] as string[] }

  const tokens = await getStoredTokens(propertyId)
  if (!tokens) {
    result.errors.push('IEC not connected for this property')
    return result
  }

  const serviceClient = createServiceClient()

  for (const contractId of tokens.contractIds) {
    try {
      const invoices = await getBillingInvoices(propertyId, contractId, tokens.bpNumber)

      for (const inv of invoices) {
        // Dedup: check if this invoice number already exists
        const { data: existing } = await serviceClient
          .from('bills')
          .select('id')
          .eq('property_id', propertyId)
          .eq('bill_type', 'iec')
          .or(`ai_parsed_data->>invoice_number.eq.${inv.invoiceNumber},ai_parsed_data->>account_number.eq.${inv.invoiceNumber}`)
          .limit(1)

        if (existing && existing.length > 0) {
          result.skipped++
          continue
        }

        // Download PDF
        let storagePath: string | null = null
        try {
          const pdf = await getInvoicePdf(propertyId, inv.invoiceNumber, contractId, tokens.bpNumber)
          storagePath = `bills/iec_${inv.invoiceNumber}.pdf`
          await serviceClient.storage
            .from('documents')
            .upload(storagePath, pdf, { contentType: 'application/pdf' })
        } catch {
          // PDF download failed — create bill without PDF
        }

        // Create bill linked to this property
        const amountAgorot = Math.round(inv.totalAmount * 100)

        await serviceClient.from('bills').insert({
          property_id: propertyId,
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
