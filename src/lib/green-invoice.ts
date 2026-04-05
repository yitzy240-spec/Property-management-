/**
 * Green Invoice (חשבונית ירוקה) API Client
 *
 * Handles: JWT auth, document creation (invoices/receipts), client sync,
 * expense recording, and document downloads.
 *
 * Prices: Green Invoice uses actual currency amounts (e.g., 500 = ₪500).
 * Our DB stores agorot — always divide by 100 before sending.
 */

const BASE_URL = process.env.GREEN_INVOICE_SANDBOX === 'true'
  ? 'https://sandbox.d.greeninvoice.co.il/api/v1'
  : 'https://api.greeninvoice.co.il/api/v1'

// ── Document Type Codes ──

export const DOC_TYPES = {
  QUOTE: 10,              // הצעת מחיר
  ORDER: 100,             // הזמנה
  PROFORMA: 300,          // חשבון עסקה
  TAX_INVOICE: 305,       // חשבונית מס
  TAX_INVOICE_RECEIPT: 320, // חשבונית מס / קבלה (most common)
  CREDIT_NOTE: 330,       // חשבונית זיכוי
  RECEIPT: 400,           // קבלה
} as const

// ── Payment Type Codes ──

export const PAYMENT_TYPES = {
  UNPAID: -1,
  CASH: 1,
  CHECK: 2,
  CREDIT_CARD: 3,
  BANK_TRANSFER: 4,
  PAYPAL: 5,
  PAYMENT_APP: 10,  // Bit, Paybox
  OTHER: 11,
} as const

// ── JWT Token Cache ──

let cachedToken: { jwt: string; expiresAt: number } | null = null

async function getJwtToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.jwt
  }

  const apiId = process.env.GREEN_INVOICE_API_ID
  const apiSecret = process.env.GREEN_INVOICE_API_SECRET

  if (!apiId || !apiSecret) {
    throw new Error('Green Invoice credentials not configured (GREEN_INVOICE_API_ID, GREEN_INVOICE_API_SECRET)')
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

  cachedToken = {
    jwt: data.token,
    expiresAt: Date.now() + 55 * 60 * 1000, // 55 min (token valid for 1h)
  }

  return data.token
}

async function giFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getJwtToken()

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
    throw new Error(`Green Invoice API ${res.status}: ${body.errorMessage || JSON.stringify(body).slice(0, 200)}`)
  }

  return res.json()
}

// ── Clients (Property Owners) ──

interface GIClient {
  id: string
  name: string
  emails: string[]
  phone?: string
  address?: string
  city?: string
  country?: string
}

/** Create or update a client (property owner) in Green Invoice */
export async function syncOwnerAsClient(owner: {
  name: string
  email: string
  phone?: string | null
  greenInvoiceClientId?: string | null
}): Promise<string> {
  if (owner.greenInvoiceClientId) {
    // Update existing
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

  // Search for existing client by email
  const search = await giFetch<{ items: GIClient[] }>('/clients/search', {
    method: 'POST',
    body: JSON.stringify({ email: owner.email }),
  })

  if (search.items.length > 0) {
    return search.items[0].id
  }

  // Create new client
  const created = await giFetch<GIClient>('/clients', {
    method: 'POST',
    body: JSON.stringify({
      name: owner.name,
      emails: [owner.email],
      phone: owner.phone || undefined,
      country: 'IL',
      add: true,
    }),
  })

  return created.id
}

// ── Documents (Invoices) ──

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
    priceAgorot: number  // We convert to ILS internally
  }[]
  paymentType?: number
  remarks?: string
  date?: string       // YYYY-MM-DD
  dueDate?: string    // YYYY-MM-DD
}

interface GIDocument {
  id: string
  number: number
  type: number
  status: number
  total: number
  url: { he: string; en: string }
}

/** Create a document (invoice, receipt, etc.) */
export async function createDocument(options: CreateDocumentOptions): Promise<GIDocument> {
  const income = options.items.map(item => ({
    description: item.description,
    quantity: item.quantity,
    price: item.priceAgorot / 100, // agorot → ILS
    currency: options.currency || 'ILS',
    vatType: 0,
  }))

  const totalILS = income.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const body: Record<string, unknown> = {
    type: options.type,
    lang: options.lang || 'he',
    currency: options.currency || 'ILS',
    date: options.date || new Date().toISOString().split('T')[0],
    dueDate: options.dueDate,
    client: {
      id: options.clientId || undefined,
      name: options.clientName,
      emails: [options.clientEmail],
      add: true,
    },
    income,
    remarks: options.remarks,
  }

  // Add payment if not unpaid
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

/** Create a commission invoice for an owner */
export async function createCommissionInvoice(params: {
  ownerName: string
  ownerEmail: string
  ownerGreenInvoiceId?: string | null
  propertyName: string
  billingMonth: string  // e.g. "2026-04"
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

  return createDocument({
    type: DOC_TYPES.TAX_INVOICE_RECEIPT,
    clientId: params.ownerGreenInvoiceId || undefined,
    clientName: params.ownerName,
    clientEmail: params.ownerEmail,
    lang: params.lang || 'he',
    items,
    paymentType: PAYMENT_TYPES.BANK_TRANSFER,
    remarks: `Marcus Properties — ${params.propertyName} management fees for ${params.billingMonth}`,
  })
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

// ── Document Search ──

interface DocumentSearchParams {
  fromDate?: string
  toDate?: string
  type?: number[]
  status?: number[]
  sort?: string
  page?: number
  pageSize?: number
}

export async function searchDocuments(params: DocumentSearchParams): Promise<{ items: GIDocument[]; total: number }> {
  return giFetch('/documents/search', {
    method: 'POST',
    body: JSON.stringify({
      from: params.fromDate,
      to: params.toDate,
      type: params.type,
      status: params.status,
      sort: params.sort || 'documentDate',
      page: params.page || 1,
      pageSize: params.pageSize || 25,
    }),
  })
}

// ── Expenses ──

/** Upload a bill PDF as an expense draft (OCR auto-parsed by Green Invoice) */
export async function uploadExpense(pdfBuffer: Buffer, filename: string): Promise<{ id: string }> {
  const token = await getJwtToken()

  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), filename)

  const res = await fetch(`${BASE_URL}/expenses/file`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Expense upload failed: ${body.errorMessage || res.status}`)
  }

  return res.json()
}

// ── Business Info ──

export async function getBusinessInfo(): Promise<{
  id: string
  name: string
  type: number  // 1=Osek Murshe, 3=Osek Patur
  taxId: string
}> {
  return giFetch('/businesses/me')
}
