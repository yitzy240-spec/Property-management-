// ApartmentOS Core Types
// These mirror the Supabase schema. After connecting Supabase,
// run `npm run db:gen-types` to auto-generate database.ts

export type OwnerProfile = 'investor' | 'hybrid' | 'private'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type BillType = 'arnona' | 'iec' | 'water' | 'vaad_bayit' | 'internet' | 'gas' | 'other'
export type BillStatus = 'pending_review' | 'approved' | 'flagged' | 'rejected'
export type PaymentStatus = 'pending' | 'partial' | 'complete'
export type PaymentMethod = 'bank_transfer' | 'cash' | 'bit' | 'credit_card' | 'paypal' | 'check' | 'other'
export type CurrencyCode = 'ILS' | 'USD' | 'EUR' | 'GBP'
export type MagicLinkType = 'contractor' | 'cleaner' | 'guest'
export type InventoryStatus = 'in_closet' | 'at_laundry' | 'damaged' | 'retired'
export type FeeType = 'commission' | 'hourly' | 'fixed'
export type DocumentCategory = 'tabu' | 'insurance' | 'contract' | 'warranty' | 'receipt' | 'other'
export type SeasonType = 'rain_roof' | 'boiler_heating' | 'ac_clean'
export type ReportStatus = 'draft' | 'approved' | 'sent'
export type StatementStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'partially_paid' | 'paid' | 'overdue'
export type StatementDirection = 'owner_owes' | 'marcus_owes' | 'zero'
export type LineItemSection = 'bookings' | 'fees' | 'incidentals'
export type LineItemCategory = 'rental_direct' | 'commission_direct' | 'commission_platform' | 'hourly' | 'fixed_fee' | 'bill_expense' | 'custom' | 'cc_surcharge'

// ============================================
// Core Entities
// ============================================

export interface Owner {
  id: string
  auth_user_id: string | null
  full_name: string
  email: string
  phone: string | null
  profile: OwnerProfile
  notes: string | null
  green_invoice_client_id: string | null
  created_at: string
  updated_at: string
}

export interface GuestLink {
  label: string
  url: string
  hide_until_revealed: boolean
}

export interface Property {
  id: string
  owner_id: string
  name: string
  address: string
  city: string
  neighborhood: string | null
  num_bedrooms: number
  num_beds: number
  entry_code: string | null
  building_entry_code: string | null
  entry_code_updated_at: string | null
  youtube_tutorial_url: string | null
  canva_design_url: string | null
  entry_instructions?: string | null
  guest_links?: GuestLink[] | null
  ical_feed_urls: ICalFeed[]
  lodgify_property_id: string | null
  maintenance_notes: string | null
  guest_guide_base_text: string | null
  management_fee_agorot: number
  hourly_rate_agorot: number
  commission_rate: number
  image_url: string | null
  lodgify_data: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ICalFeed {
  platform: string
  url: string
}

export interface Booking {
  id: string
  property_id: string
  platform: string | null
  external_id: string | null
  guest_name: string | null
  check_in: string
  check_out: string
  gross_rental_agorot: number | null
  channel_fees_agorot: number | null
  guest_language: string | null
  ical_uid: string | null
  synced_at: string | null
  // Multi-currency
  currency: CurrencyCode
  original_amount_cents: number | null
  exchange_rate: number | null
  // Payment tracking
  commission_amount_agorot: number | null
  commission_currency: CurrencyCode
  commission_original_cents: number | null
  deposit_amount_agorot: number | null
  payment_status: PaymentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PropertyUtilityAccount {
  id: string
  property_id: string
  utility_type: BillType
  label: string              // e.g. "מספר לקוח", "חשבון חוזה", "מספר מונה"
  account_number: string
  autopay: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BookingPayment {
  id: string
  booking_id: string
  amount_agorot: number
  currency: CurrencyCode
  original_amount_cents: number | null
  payment_method: PaymentMethod
  payment_date: string | null
  received_by: string | null
  is_deposit: boolean
  is_commission: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Bill {
  id: string
  property_id: string
  bill_type: BillType
  amount_agorot: number
  due_date: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  status: BillStatus
  is_anomaly: boolean
  anomaly_note: string | null
  pdf_storage_path: string | null
  gmail_message_id: string | null
  ai_parsed_data: Record<string, unknown> | null
  approved_by: string | null
  approved_at: string | null
  routing_confidence?: 'verified' | 'label_only' | 'mismatch'
  created_at: string
  updated_at: string
}

export interface Contractor {
  id: string
  name: string
  phone: string | null
  email: string | null
  specialty: string | null
  is_active: boolean
  created_at: string
}

export interface Task {
  id: string
  property_id: string
  contractor_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  is_seasonal: boolean
  season_type: SeasonType | null
  is_routine_check: boolean
  is_cleaning: boolean
  due_date: string | null
  completed_at: string | null
  billable_hours: number
  expense_agorot: number
  receipt_storage_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TaskChecklistItem {
  id: string
  task_id: string
  label: string
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  ai_generated: boolean
}

export interface TaskMedia {
  id: string
  task_id: string
  storage_path: string
  media_type: 'image' | 'video'
  caption: string | null
  uploaded_by: string
  created_at: string
}

export interface MagicLink {
  id: string
  token: string
  link_type: MagicLinkType
  property_id: string
  task_id: string | null
  contractor_id: string | null
  booking_id: string | null
  expires_at: string
  is_used: boolean
  used_at: string | null
  created_at: string
}

export interface InventoryItem {
  id: string
  property_id: string
  item_name: string
  quantity_in_closet: number
  quantity_at_laundry: number
  quantity_damaged: number
  par_level: number | null
  last_counted_at: string | null
  created_at: string
  updated_at: string
}

export interface LaundryBatch {
  id: string
  property_id: string
  items: { item_name: string; quantity: number }[]
  sent_at: string | null
  returned_at: string | null
  laundry_provider_notified: boolean
  notes: string | null
  created_at: string
}

export interface FeeEntry {
  id: string
  property_id: string
  fee_type: FeeType
  amount_agorot: number
  description: string | null
  booking_id: string | null
  task_id: string | null
  billing_month: string
  pushed_to_invoice: boolean
  invoice_id: string | null
  created_at: string
}

export interface Document {
  id: string
  property_id: string | null
  owner_id: string | null
  category: DocumentCategory
  title: string
  storage_path: string
  /** Original (possibly Hebrew/Unicode) filename, preserved for download. NULL on pre-migration rows. */
  original_filename?: string | null
  file_size: number | null
  uploaded_by: 'admin' | 'owner'
  expiry_date: string | null
  ai_classified: boolean
  ai_classification_data: Record<string, unknown> | null
  notes: string | null
  created_at: string
}

export interface OwnerReport {
  id: string
  owner_id: string
  quarter: number
  year: number
  report_data: Record<string, unknown>
  ai_narrative_en: string | null
  ai_narrative_he: string | null
  edited_narrative_en: string | null
  edited_narrative_he: string | null
  status: ReportStatus
  approved_at: string | null
  sent_at: string | null
  sent_via: string | null
  created_at: string
  updated_at: string
}

export interface GuestGuideCache {
  id: string
  property_id: string
  language_code: string
  guide_content: string
  generated_at: string
}

// ============================================
// Computed / View Types
// ============================================

export interface VatThreshold {
  year: number
  ytd_revenue_agorot: number
  threshold_agorot: number  // 12283300 (₪122,833)
  percentage: number
  is_warning: boolean       // >= 90%
}

export interface ContractorItinerary {
  contractor: Contractor
  tasks: (Task & { property: Pick<Property, 'name' | 'address' | 'entry_code'> })[]
}

export interface PropertyWithOwner extends Property {
  owner: Owner
}

export interface BookingWithGap extends Booking {
  gap_hours_after: number | null
}

export interface BookingWithPayments extends Booking {
  payments: BookingPayment[]
}

export interface PropertyWithUtilities extends Property {
  utility_accounts: PropertyUtilityAccount[]
}

// ============================================
// Monthly Billing & Statements
// ============================================

export interface MonthlyStatement {
  id: string
  owner_id: string
  billing_month: string
  status: StatementStatus
  direction: StatementDirection
  gross_rental_agorot: number
  commission_agorot: number
  hourly_charges_agorot: number
  fixed_fee_agorot: number
  bills_paid_agorot: number
  cc_surcharge_agorot: number
  net_amount_agorot: number
  line_items: StatementLineItemData[]
  gi_proforma_id: string | null
  gi_proforma_number: number | null
  gi_proforma_url: string | null
  gi_receipt_id: string | null
  gi_receipt_number: number | null
  amount_paid_agorot: number
  paid_at: string | null
  payment_method: string | null
  payment_reference: string | null
  reminder_sent_at: string | null
  sent_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface StatementLineItemData {
  property_id: string
  property_name: string
  section: LineItemSection
  category: LineItemCategory
  description: string
  amount_agorot: number
  source_id?: string
  source_type?: string
  /** true if admin manually added/edited this item */
  is_manual?: boolean
}

export interface StatementLineItem {
  id: string
  statement_id: string
  property_id: string | null
  category: string
  description: string
  amount_agorot: number
  source_id: string | null
  source_type: string | null
  created_at: string
}

export interface StatementPayment {
  id: string
  statement_id: string
  amount_agorot: number
  payment_method: string
  payment_date: string
  reference: string | null
  gi_receipt_id: string | null
  gi_receipt_number: number | null
  notes: string | null
  recorded_by: string | null
  created_at: string
}

export interface MonthlyStatementWithOwner extends MonthlyStatement {
  owner: Owner
}

export interface MonthlyStatementWithDetails extends MonthlyStatement {
  owner: Owner
  payments: StatementPayment[]
}

// ============================================
// Visits
// ============================================

export const VISIT_CHECKLIST_ITEMS = [
  { key: 'electricity_working', label: 'Electricity working' },
  { key: 'run_sinks', label: 'Run sinks' },
  { key: 'run_showers', label: 'Run showers' },
  { key: 'flush_toilets', label: 'Flush toilets' },
  { key: 'refrigerator_freezer', label: 'Refrigerator and Freezer working' },
  { key: 'soap_stock', label: 'Soap / toilet paper / etc in stock' },
  { key: 'boiler_off', label: 'Make sure boiler is off' },
  { key: 'washer_door_open', label: 'Check washer door is open' },
  { key: 'dryer_lint', label: 'Check dryer lint' },
  { key: 'bedrooms_no_mold', label: 'Bedrooms no mold or leaking on walls' },
  { key: 'check_mailbox', label: 'Check mailbox' },
] as const

export type ChecklistKey = typeof VISIT_CHECKLIST_ITEMS[number]['key']

export interface Visit {
  id: string
  property_id: string
  visited_at: string
  checklist: Partial<Record<ChecklistKey, boolean>>
  note: string | null
  admin_note: string | null
  created_by: string
  created_at: string
  properties?: { name: string }
}

export interface VisitMedia {
  id: string
  visit_id: string
  file_path: string
  file_type: 'image' | 'video'
  is_private: boolean
  created_at: string
}
