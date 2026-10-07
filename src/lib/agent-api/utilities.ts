import { z } from 'zod'
import { AgentError, toMajor, type ServiceClient } from './core'

const utilityType = z.enum(['iec', 'water', 'gas', 'internet', 'arnona', 'vaad_bayit', 'other'])
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const UtilityAccountCreate = z
  .object({
    property_id: z.string().uuid(),
    utility_type: utilityType,
    label: z.string().min(1).max(200),
    account_number: z.string().min(1).max(100),
    provider_name: z.string().max(200).nullish(),
    autopay: z.boolean().default(false),
    notes: z.string().max(2000).nullish(),
  })
  .strict()

export const UtilityAccountPatch = z
  .object({
    property_id: z.string().uuid(),
    utility_type: utilityType,
    label: z.string().min(1).max(200),
    account_number: z.string().min(1).max(100),
    provider_name: z.string().max(200).nullable(),
    autopay: z.boolean(),
    notes: z.string().max(2000).nullable(),
  })
  .partial()
  .strict()

export const UTILITY_COLUMNS = 'id, property_id, utility_type, label, account_number, provider_name, autopay, notes, created_at, updated_at, properties(name)'

export function serializeUtility(u: Record<string, unknown>) {
  const { properties, ...rest } = u
  return { ...rest, property_id: u.property_id as string, property_name: (properties as { name?: string } | null)?.name ?? null }
}

export async function loadUtility(db: ServiceClient, id: string) {
  const { data, error } = await db.from('property_utility_accounts').select(UTILITY_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Utility account not found.')
  return serializeUtility(data as unknown as Record<string, unknown>)
}

/** Bills are always ILS. Agent-created bills enter the admin's review queue. */
export const BillCreate = z
  .object({
    property_id: z.string().uuid(),
    bill_type: utilityType,
    amount_ils: z.number().positive(),
    due_date: date.nullish(),
    billing_period_start: date.nullish(),
    billing_period_end: date.nullish(),
  })
  .strict()

export const BillPatch = z
  .object({
    property_id: z.string().uuid(),
    bill_type: utilityType,
    amount_ils: z.number().positive(),
    due_date: date.nullable(),
    billing_period_start: date.nullable(),
    billing_period_end: date.nullable(),
  })
  .partial()
  .strict()

export const BILL_COLUMNS =
  'id, property_id, bill_type, amount_agorot, due_date, billing_period_start, billing_period_end, status, ' +
  'payment_method, pdf_storage_path, created_at, updated_at, properties(name)'

export function serializeBill(b: Record<string, unknown>) {
  return {
    id: b.id,
    property_id: b.property_id,
    property_name: (b.properties as { name?: string } | null)?.name ?? null,
    bill_type: b.bill_type,
    amount_ils: toMajor(b.amount_agorot as number),
    due_date: b.due_date ?? null,
    billing_period_start: b.billing_period_start ?? null,
    billing_period_end: b.billing_period_end ?? null,
    status: b.status,
    payment_method: b.payment_method ?? null,
    has_pdf: !!b.pdf_storage_path,
    created_at: b.created_at,
    updated_at: b.updated_at,
  }
}

export async function loadBill(db: ServiceClient, id: string) {
  const { data, error } = await db.from('bills').select(BILL_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Bill not found.')
  return serializeBill(data as unknown as Record<string, unknown>)
}
