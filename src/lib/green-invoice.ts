/**
 * Green Invoice (חשבונית ירוקה) API Client
 *
 * IMPORTANT: Green Invoice uses 1-based pagination. page: 0 is INVALID.
 * Prices are in actual currency (e.g., 500 = ₪500), not agorot.
 * Empty body {} works for searches — adding page: 0 or invalid pageSize breaks them.
 */

const BASE_URL = process.env.GREEN_INVOICE_SANDBOX === 'true'
  ? 'https://sandbox.d.greeninvoice.co.il/api/v1'
  : 'https://api.greeninvoice.co.il/api/v1'

// ── Document Type Codes ──

export const DOC_TYPES = {
  QUOTE: 10,                // הצעת מחיר
  ORDER: 100,               // הזמנה
  PROFORMA: 300,            // חשבון עסקה
  TAX_INVOICE: 305,         // חשבונית מס
  TAX_INVOICE_RECEIPT: 320, // חשבונית מס / קבלה
  CREDIT_NOTE: 330,         // חשבונית זיכוי
  RECEIPT: 400,             // קבלה — Marcus's primary type
} as const

// ── Payment Type Codes ──

export const PAYMENT_TYPES = {
  UNPAID: -1,
  CASH: 1,
  CHECK: 2,
  CREDIT_CARD: 3,
  BANK_TRANSFER: 4,
  PAYPAL: 5,
  PAYMENT_APP: 10,
  OTHER: 11,
} as const

// ── JWT Token Cache ──

let cachedToken: { jwt: string; expiresAt: number } | null = null

async function getJwtToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.jwt
  }

  // Use sandbox-specific credentials when in sandbox mode
  const isSandbox = process.env.GREEN_INVOICE_SANDBOX === 'true'
  const apiId = isSandbox
    ? (process.env.GREEN_INVOICE_SANDBOX_API_ID || process.env.GREEN_INVOICE_API_ID)
    : process.env.GREEN_INVOICE_API_ID
  const apiSecret = isSandbox
    ? (process.env.GREEN_INVOICE_SANDBOX_API_SECRET || process.env.GREEN_INVOICE_API_SECRET)
    : process.env.GREEN_INVOICE_API_SECRET

  console.log(`[GI Auth] sandbox=${isSandbox}, apiId=${apiId?.slice(0, 8)}..., baseUrl=${BASE_URL.split('//')[1]?.slice(0, 20)}`)

  if (!apiId || !apiSecret) {
    throw new Error('Green Invoice credentials not configured')
  }

  const res = await fetch(`${BASE_URL}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: apiId, secret: apiSecret }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Green Invoice auth failed: ${body.errorMessage || res.status}`)
  }

  const data = await res.json()
  cachedToken = { jwt: data.token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return data.token
}

async function giFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getJwtToken()

  console.log(`[GI API] ${options.method || 'GET'} ${path}`)

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.error(`[GI API] ${options.method || 'GET'} ${path} → ${res.status}:`, JSON.stringify(body).slice(0, 300))
    throw new Error(`Green Invoice API ${res.status}: ${body.errorMessage || JSON.stringify(body).slice(0, 200)}`)
  }

  return res.json()
}

// ══════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════

export interface GIClient {
  id: string
  name: string
  emails: string[]
  phone?: string
}

/** Search all clients. Green Invoice uses empty body for "get all". */
export async function searchClients(): Promise<{ items: GIClient[]; total: number }> {
  return giFetch('/clients/search', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Create or update a client (property owner) in Green Invoice */
export async function syncOwnerAsClient(owner: {
  name: string
  email: string
  phone?: string | null
  greenInvoiceClientId?: string | null
}): Promise<string> {
  if (owner.greenInvoiceClientId) {
    await giFetch(`/clients/${owner.greenInvoiceClientId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: owner.name,
        emails: [owner.email],
        phone: owner.phone || undefined,
      }),
    })
    return owner.greenInvoiceClientId
  }

  // Search all clients and match by name (emails are often empty in GI)
  const search = await searchClients()
  const match = search.items.find(c =>
    c.name.toLowerCase() === owner.name.toLowerCase() ||
    c.emails?.includes(owner.email)
  )

  if (match) return match.id

  // Create new
  const created = await giFetch<GIClient>('/clients', {
    method: 'POST',
    body: JSON.stringify({
      name: owner.name,
      emails: [owner.email],
      phone: owner.phone || undefined,
      country: 'IL',
    }),
  })

  return created.id
}

// ══════════════════════════════════════
// DOCUMENTS
// ══════════════════════════════════════

export interface GIDocument {
  id: string
  number: number
  type: number
  status: number
  amount: number
  currency: string
  documentDate: string
  client?: { id: string; name: string }
  url?: { he: string; en: string }
}

interface CreateDocumentOptions {
  type: number
  clientId?: string
  clientName: string
  clientEmail: string
  lang?: 'he' | 'en'
  currency?: string
  items: {
    description: string
    quantity: number
    priceAgorot: number
  }[]
  paymentType?: number
  remarks?: string
  date?: string
  dueDate?: string
  /** If true, creates as draft — no email sent to client */
  draft?: boolean
  /** Custom text for GI email sent to customer */
  emailContent?: string
  /** Enable payment button on the document (requires active payment channels) */
  paymentRequestData?: { pluginId?: number }
}

/** Create a document (invoice, receipt, etc.) */
export async function createDocument(options: CreateDocumentOptions): Promise<GIDocument> {
  const income = options.items.map(item => ({
    description: item.description,
    quantity: item.quantity,
    price: item.priceAgorot / 100,
    currency: options.currency || 'ILS',
    vatType: 0,
  }))

  const totalILS = income.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const body: Record<string, unknown> = {
    type: options.type,
    lang: options.lang || 'en',
    currency: options.currency || 'ILS',
    date: options.date || new Date().toISOString().split('T')[0],
    dueDate: options.dueDate,
    draft: options.draft ?? false,
    client: {
      id: options.clientId || undefined,
      name: options.clientName,
      emails: [options.clientEmail],
      add: true,
    },
    income,
    remarks: options.remarks,
    emailContent: options.emailContent,
    paymentRequestData: options.paymentRequestData,
  }

  if (options.paymentType !== undefined && options.paymentType !== PAYMENT_TYPES.UNPAID) {
    body.payment = [{
      date: options.date || new Date().toISOString().split('T')[0],
      type: options.paymentType,
      price: totalILS,
      currency: options.currency || 'ILS',
    }]
  }

  return giFetch<GIDocument>('/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Create a commission receipt (type 400) for an owner — matches Marcus's existing pattern */
export async function createCommissionInvoice(params: {
  ownerName: string
  ownerEmail: string
  ownerGreenInvoiceId?: string | null
  propertyName: string
  billingMonth: string
  commissionAgorot: number
  hourlyAgorot: number
  fixedFeeAgorot: number
  lang?: 'he' | 'en'
}): Promise<GIDocument> {
  const items: CreateDocumentOptions['items'] = []

  if (params.commissionAgorot > 0) {
    items.push({
      description: `Commission — ${params.propertyName} (${params.billingMonth})`,
      quantity: 1,
      priceAgorot: params.commissionAgorot,
    })
  }

  if (params.hourlyAgorot > 0) {
    items.push({
      description: `Hourly services — ${params.propertyName} (${params.billingMonth})`,
      quantity: 1,
      priceAgorot: params.hourlyAgorot,
    })
  }

  if (params.fixedFeeAgorot > 0) {
    items.push({
      description: `Monthly management fee — ${params.propertyName} (${params.billingMonth})`,
      quantity: 1,
      priceAgorot: params.fixedFeeAgorot,
    })
  }

  if (items.length === 0) {
    throw new Error('No billable items for this invoice')
  }

  // Use RECEIPT (400) to match Marcus's existing document pattern
  return createDocument({
    type: DOC_TYPES.RECEIPT,
    clientId: params.ownerGreenInvoiceId || undefined,
    clientName: params.ownerName,
    clientEmail: params.ownerEmail,
    lang: params.lang || 'en',
    items,
    paymentType: PAYMENT_TYPES.BANK_TRANSFER,
    remarks: `Marcus Properties — ${params.propertyName} management fees for ${params.billingMonth}`,
  })
}

// ── Document Search ──

interface DocumentSearchParams {
  fromDate?: string
  toDate?: string
  type?: number[]
  status?: number[]
  sort?: string
  page?: number
}

/** Search documents. NOTE: page is 1-based. Empty body returns all. */
export async function searchDocuments(params: DocumentSearchParams = {}): Promise<{ items: GIDocument[]; total: number }> {
  // Build body carefully — only include fields that have values
  // Green Invoice rejects invalid/empty pagination params
  const body: Record<string, unknown> = {}
  if (params.fromDate) body.from = params.fromDate
  if (params.toDate) body.to = params.toDate
  if (params.type) body.type = params.type
  if (params.status) body.status = params.status
  if (params.sort) body.sort = params.sort
  if (params.page && params.page > 1) body.page = params.page

  return giFetch('/documents/search', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Fetch ALL documents across all pages */
export async function fetchAllDocuments(): Promise<GIDocument[]> {
  const allDocs: GIDocument[] = []
  let page = 1

  while (true) {
    const body: Record<string, unknown> = {}
    if (page > 1) body.page = page

    const result = await giFetch<{ items: GIDocument[]; total: number; pages: number }>('/documents/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    allDocs.push(...(result.items || []))
    if (page >= (result.pages || 1)) break
    page++
  }

  return allDocs
}

// ── Document Downloads ──

interface DownloadLinks {
  he: string
  en: string
}

/** Get PDF download links (Hebrew + English) for a document */
export async function getDocumentDownloadLinks(documentId: string): Promise<DownloadLinks> {
  return giFetch<DownloadLinks>(`/documents/${documentId}/download/links`)
}

// ══════════════════════════════════════
// PAYMENT LINKS (Monthly Billing)
// ══════════════════════════════════════

/**
 * Payment links are standalone URLs where customers can pay by credit card.
 * Uses POST /payments/links (not /payments/form which is for iframe embeds).
 * When the owner pays, GI auto-generates a receipt (type 400).
 *
 * Requires:
 * - Active Grow digital payments terminal
 * - GREEN_INVOICE_PLUGIN_ID env var (Grow terminal UUID)
 */

export interface GIPaymentLink {
  id: string
  url: string
  shortUrl: string
}

interface PaymentLinkOptions {
  /** Amount in agorot */
  amountAgorot: number
  /** Title shown on payment page */
  description: string
  /** Detail text shown on payment page */
  content?: string
  lang?: 'he' | 'en'
  maxPayments?: number
}

/** Create a hosted payment link. Returns a URL the owner can visit to pay. */
export async function createPaymentLink(options: PaymentLinkOptions): Promise<GIPaymentLink> {
  const pluginId = process.env.GREEN_INVOICE_PLUGIN_ID
  if (!pluginId) {
    throw new Error('GREEN_INVOICE_PLUGIN_ID not configured — required for payment links')
  }

  // Enable all available payment methods: credit card, Bit, Apple Pay, Google Pay
  const groups = [100, 120, 150, 160]
  const plugins = groups.map(group => ({
    id: pluginId,
    type: 12200, // Grow
    maxPayments: options.maxPayments || 1,
    group,
  }))

  const body = {
    type: 0,
    price: options.amountAgorot / 100,
    currency: 'ILS',
    lang: options.lang || 'en',
    description: options.description,
    content: options.content || options.description,
    documentType: DOC_TYPES.RECEIPT, // 400 — auto-generated after payment
    documentVatType: 0,
    plugins,
    notify: true,
    addClient: false,
    maxPayments: options.maxPayments || 1,
    maxQuantity: 1,
  }

  return giFetch<GIPaymentLink>('/payments/links', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Create a document directly (proforma, receipt, etc.).
 * Use for: payout receipts (marcus_owes), recording manual payments.
 * For collecting payments from owners, use createPaymentForm() instead.
 */

/** Create a Receipt (type 400) after manual payment (bank transfer, cash, check) */
export async function createReceipt(options: {
  clientId?: string
  clientName: string
  clientEmail: string
  items: { description: string; quantity: number; priceAgorot: number }[]
  paymentType: number
  paymentDate?: string
  relatedDocumentId?: string
  remarks?: string
  lang?: 'he' | 'en'
}): Promise<GIDocument> {
  const income = options.items.map(item => ({
    description: item.description,
    quantity: item.quantity,
    price: item.priceAgorot / 100,
    currency: 'ILS',
    vatType: 0,
  }))

  const totalILS = income.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const paymentDate = options.paymentDate || new Date().toISOString().split('T')[0]

  const body: Record<string, unknown> = {
    type: DOC_TYPES.RECEIPT,
    lang: options.lang || 'en',
    currency: 'ILS',
    date: paymentDate,
    client: {
      id: options.clientId || undefined,
      name: options.clientName,
      emails: [options.clientEmail],
      add: true,
    },
    income,
    payment: [{
      date: paymentDate,
      type: options.paymentType,
      price: totalILS,
      currency: 'ILS',
    }],
    remarks: options.remarks,
  }

  if (options.relatedDocumentId) {
    body.relatedDocuments = [{ id: options.relatedDocumentId }]
  }

  return giFetch<GIDocument>('/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Create a payout Receipt (type 400) documenting money Marcus pays to owner */
export async function createPayoutReceipt(options: {
  clientId?: string
  clientName: string
  clientEmail: string
  amountAgorot: number
  description: string
  paymentType: number
  paymentDate?: string
  remarks?: string
  lang?: 'he' | 'en'
}): Promise<GIDocument> {
  return createDocument({
    type: DOC_TYPES.RECEIPT,
    clientId: options.clientId,
    clientName: options.clientName,
    clientEmail: options.clientEmail,
    lang: options.lang || 'en',
    items: [{
      description: options.description,
      quantity: 1,
      priceAgorot: options.amountAgorot,
    }],
    paymentType: options.paymentType,
    date: options.paymentDate,
    remarks: options.remarks,
  })
}

/** Fetch a single document by ID */
export async function getDocument(documentId: string): Promise<GIDocument> {
  return giFetch<GIDocument>(`/documents/${documentId}`)
}

/** Get public PDF download links for a document (no auth required to access) */
export async function getDocumentPdfLinks(documentId: string): Promise<{ he?: string; en?: string; origin?: string }> {
  return giFetch(`/documents/${documentId}/download/links`)
}

/** Trigger Green Invoice's built-in email for a document (sends PDF to recipients) */
export async function sendDocumentEmail(documentId: string, emails: string[]): Promise<void> {
  await giFetch(`/documents/${documentId}/email`, {
    method: 'POST',
    body: JSON.stringify({ emails }),
  })
}

// ── Expenses ──

/** Upload a bill PDF as an expense draft */
export async function uploadExpense(pdfBuffer: Buffer, filename: string): Promise<{ id: string }> {
  const token = await getJwtToken()

  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), filename)

  const res = await fetch(`${BASE_URL}/expenses/file`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Expense upload failed: ${body.errorMessage || res.status}`)
  }

  return res.json()
}

/** Search expenses */
export async function searchExpenses(): Promise<{ items: Record<string, unknown>[]; total: number }> {
  return giFetch('/expenses/search', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// ── Business Info ──

export async function getBusinessInfo(): Promise<{
  id: string
  name: string
  type: number
  taxId: string
  address: string
  city: string
}> {
  return giFetch('/businesses/me')
}
