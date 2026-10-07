import { NextResponse } from 'next/server'
import { AGENT_SCOPES } from '@/lib/agent-api/core'

export const dynamic = 'force-static'

/**
 * GET /api/agent/v1 — self-describing guide for AI agents (no auth, no data).
 * Written for an LLM agent (Ariel's Grok Bot) to read once and act on.
 */
export function GET() {
  return NextResponse.json({
    name: 'ApartmentOS Agent API',
    version: 'v1',
    base_url: '/api/agent/v1',
    auth: 'Every request: header "Authorization: Bearer aos_...". The key is created by the admin in ApartmentOS → Settings → AI Agent Access. Keep it in your secret store.',
    scopes: AGENT_SCOPES,
    conventions: {
      dates: 'YYYY-MM-DD (Asia/Jerusalem calendar dates).',
      money: 'Decimal major units. Bookings carry their own `currency` (ILS/USD/EUR) and are NEVER converted — send the amount exactly as the guest pays it. Bills are always ILS (`amount_ils`).',
      ids: 'UUIDs. Every record is addressable at /<resource>/<id>.',
      errors: 'JSON {error, details?}. 400 invalid input (details lists fields), 401 bad key, 403 missing scope, 404 not found, 409 conflict (see rules).',
      unknown_fields: 'Rejected (400) — check spelling against this guide.',
    },
    rules: [
      'Bookings with source "lodgify" or "ical" are owned by the channel sync. Changing their dates, guest name, platform, amount or cancelling/deleting them returns 409 — make the change in Lodgify/the channel instead. Add "force": true (PATCH body) or ?force=true (DELETE) only if you accept that the next sync may undo it.',
      'Bookings with source "manual" (entered in ApartmentOS) can be edited and deleted freely.',
      'Owner stays are bookings with platform "owner_stay".',
      'Cleaning tasks are tasks with is_cleaning=true. One is auto-created each morning per upcoming checkout (linked via booking_id). Any task whose due_date you set is "schedule_locked": the automation will not delete or duplicate it.',
      'Bills you add go to the admin review queue (status pending_review). Approval and payment method stay with the admin. Approved bills cannot be edited here.',
      'Every write (and every door-code read) is recorded in an audit log the admin can see.',
    ],
    endpoints: [
      { method: 'GET', path: '/bookings', scope: 'bookings:read', query: 'property_id, from, to (stays overlapping range), updated_since, platform, guest (name contains), include_cancelled=true, limit (≤500), offset' },
      { method: 'POST', path: '/bookings', scope: 'bookings:write', body: '{property_id, check_in, check_out, guest_name?, guest_email?, guest_phone?, platform? (direct|owner_stay|airbnb|booking_com|other), amount?, currency? (ILS|USD|EUR), exchange_rate? (USD→ILS, used only on owner statements), channel_fees?, deposit?, payment_status? (pending|partial|complete), notes?}', note: 'Also blocks the dates in Lodgify when the property is linked.' },
      { method: 'GET', path: '/bookings/{id}', scope: 'bookings:read' },
      { method: 'PATCH', path: '/bookings/{id}', scope: 'bookings:write', body: 'any of the POST fields (except property_id) + is_cancelled, force', example: '{"check_out":"2026-10-12"}' },
      { method: 'DELETE', path: '/bookings/{id}', scope: 'bookings:write', query: 'force=true for synced bookings' },
      { method: 'GET', path: '/bookings/{id}/payments', scope: 'bookings:read' },
      { method: 'POST', path: '/bookings/{id}/payments', scope: 'bookings:write', body: '{amount, method? (bank_transfer|cash|bit|credit_card|paypal|check|other), payment_date?, is_deposit?, received_by?, notes?}', note: 'In the booking currency. Updates amount_paid and payment_status.' },
      { method: 'GET', path: '/tasks', scope: 'tasks:read', query: 'is_cleaning=true|false, property_id, from, to (due date), status (comma list: pending,in_progress,completed,cancelled), contractor_id, booking_id, limit, offset' },
      { method: 'POST', path: '/tasks', scope: 'tasks:write', body: '{property_id, is_cleaning?, title? (required unless cleaning), due_date?, contractor_id?, booking_id?, description?, status?, priority? (low|normal|high|urgent), notes?}' },
      { method: 'GET', path: '/tasks/{id}', scope: 'tasks:read' },
      { method: 'PATCH', path: '/tasks/{id}', scope: 'tasks:write', body: 'any of: property_id, title, description, due_date, contractor_id, booking_id, status, priority, notes', example: '{"due_date":"2026-10-09","contractor_id":"..."}' },
      { method: 'DELETE', path: '/tasks/{id}', scope: 'tasks:write' },
      { method: 'GET', path: '/contractors', scope: 'tasks:read', query: 'include_inactive=true', note: 'Resolve cleaner names (e.g. "Miriam Cleaning") to contractor_id.' },
      { method: 'GET', path: '/properties', scope: 'properties:read', query: 'include_inactive=true, owner_id' },
      { method: 'GET', path: '/properties/{id}', scope: 'properties:read' },
      { method: 'GET', path: '/properties/{id}/codes', scope: 'codes:read', note: 'Door/building codes + WiFi. Logged.' },
      { method: 'GET', path: '/owners', scope: 'owners:read' },
      { method: 'GET', path: '/owners/{id}', scope: 'owners:read' },
      { method: 'PATCH', path: '/owners/{id}', scope: 'owners:write', body: 'any of: full_name, email, phone, profile (investor|hybrid|private), notes' },
      { method: 'GET', path: '/utility-accounts', scope: 'utilities:read', query: 'property_id, utility_type (iec|water|gas|internet|arnona|vaad_bayit|other)' },
      { method: 'POST', path: '/utility-accounts', scope: 'utilities:write', body: '{property_id, utility_type, label, account_number, provider_name?, autopay?, notes?}', note: 'account_number is used to route incoming bills — keep it exact.' },
      { method: 'GET', path: '/utility-accounts/{id}', scope: 'utilities:read' },
      { method: 'PATCH', path: '/utility-accounts/{id}', scope: 'utilities:write' },
      { method: 'GET', path: '/bills', scope: 'bills:read', query: 'property_id, bill_type, status (pending_review,approved,flagged,rejected), from, to (due date), limit, offset' },
      { method: 'POST', path: '/bills', scope: 'bills:write', body: '{property_id, bill_type, amount_ils, due_date?, billing_period_start?, billing_period_end?}' },
      { method: 'GET', path: '/bills/{id}', scope: 'bills:read' },
      { method: 'PATCH', path: '/bills/{id}', scope: 'bills:write', body: 'any of: property_id, bill_type, amount_ils, due_date, billing_period_start, billing_period_end' },
    ],
  })
}
